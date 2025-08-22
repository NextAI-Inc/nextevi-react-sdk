/**
 * WebSocket Connection Manager for NextEVI Voice SDK
 * Handles WebSocket connections, message routing, and connection state
 */

import {
  NextEVIConfig,
  APIKeyAuthConfig,
  JWTAuthConfig,
  ConnectionState,
  WebSocketMessage,
  TranscriptionResult,
  TTSChunk,
  LLMResponseChunk,
  EmotionData,
  ConnectionMetadata,
  NextEVIError,
  ErrorCode,
  InterruptionMessage,
  SystemMessage,
  TurnCompleteMessage,
  IdleWarningMessage,
  TurnDetectionResult
} from '../types';

import { isJWTAuth, isAPIKeyAuth } from './auth';
import { getLocationInfo, isBrowserEnvironment } from './browser-apis';

export interface WebSocketEvents {
  onStateChange: (state: ConnectionState) => void;
  onTranscription: (result: TranscriptionResult) => void;
  onTTSChunk: (chunk: TTSChunk) => void;
  onLLMChunk: (chunk: LLMResponseChunk) => void;
  onEmotion: (emotions: EmotionData[]) => void;
  onConnectionMetadata: (metadata: ConnectionMetadata) => void;
  onError: (error: NextEVIError) => void;
  // New event handlers
  onInterruption?: (interruption: InterruptionMessage) => void;
  onSystemMessage?: (message: SystemMessage) => void;
  onTurnComplete?: (turn: TurnCompleteMessage) => void;
  onIdleWarning?: (warning: IdleWarningMessage) => void;
}

export class WebSocketManager {
  private websocket: WebSocket | null = null;
  private config: NextEVIConfig | null = null;
  private connectionState: ConnectionState = ConnectionState.Disconnected;
  private connectionId: string | null = null;
  private events: Partial<WebSocketEvents> = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false; // Flag to prevent concurrent connections

  constructor() {
    // Bind methods to preserve 'this' context
    this.handleOpen = this.handleOpen.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
  }

  /**
   * Set event handlers for WebSocket events
   */
  setEvents(events: Partial<WebSocketEvents>) {
    this.events = { ...this.events, ...events };
  }

  /**
   * Connect to NextEVI voice service
   */
  async connect(config: NextEVIConfig): Promise<void> {
    // Prevent duplicate connections
    if (this.connectionState === ConnectionState.Connected) {
      if (config.debug) {
        console.log('[NextEVI] WebSocket already connected, skipping');
      }
      return;
    }
    
    if (this.isConnecting) {
      if (config.debug) {
        console.log('[NextEVI] WebSocket connection already in progress, skipping');
      }
      return;
    }
    
    this.isConnecting = true;

    this.config = config;
    this.connectionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.setConnectionState(ConnectionState.Connecting);
      
      // Build WebSocket URL and handle authentication
      const { wsUrl, headers } = this.buildWebSocketUrlWithAuth(config);
      
      if (config.debug) {
        console.log('[NextEVI] Connecting to:', wsUrl);
      }

      // Create WebSocket connection with optional headers
      if (headers && Object.keys(headers).length > 0) {
        // For browsers that support headers in WebSocket constructor (not standard)
        // We'll handle JWT auth via query parameter as fallback
        this.websocket = new WebSocket(wsUrl);
        
        // Store headers for potential use in connection logic
        (this.websocket as any)._nextevi_headers = headers;
      } else {
        this.websocket = new WebSocket(wsUrl);
      }
      this.websocket.binaryType = 'arraybuffer';

      // Set up event handlers
      this.websocket.onopen = this.handleOpen;
      this.websocket.onmessage = this.handleMessage;
      this.websocket.onclose = this.handleClose;
      this.websocket.onerror = this.handleError;

      // Wait for connection to be established
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.isConnecting = false; // Reset flag on timeout
          reject(new NextEVIError('Connection timeout', ErrorCode.CONNECTION_FAILED));
        }, 10000);

        const originalOnStateChange = this.events.onStateChange;
        this.events.onStateChange = (state: ConnectionState) => {
          if (originalOnStateChange) originalOnStateChange(state);
          
          if (state === ConnectionState.Connected) {
            clearTimeout(timeout);
            this.isConnecting = false; // Reset flag on success
            this.events.onStateChange = originalOnStateChange;
            resolve();
          } else if (state === ConnectionState.Error) {
            clearTimeout(timeout);
            this.isConnecting = false; // Reset flag on error
            this.events.onStateChange = originalOnStateChange;
            reject(new NextEVIError('Connection failed', ErrorCode.CONNECTION_FAILED));
          }
        };
      });

    } catch (error) {
      this.isConnecting = false; // Reset flag on error
      this.setConnectionState(ConnectionState.Error);
      throw new NextEVIError(
        `Connection failed: ${(error as Error).message}`,
        ErrorCode.CONNECTION_FAILED,
        error
      );
    }
  }

  /**
   * Disconnect from service
   */
  async disconnect(): Promise<void> {
    this.isConnecting = false; // Reset flag
    
    if (this.websocket) {
      // Remove event handlers to prevent reconnection attempts
      this.websocket.onclose = null;
      this.websocket.onerror = null;
      
      this.websocket.close(1000, 'User initiated disconnect');
      this.websocket = null;
    }
    
    this.connectionId = null;
    this.config = null;
    this.reconnectAttempts = 0;
    this.setConnectionState(ConnectionState.Disconnected);
  }

  /**
   * Send session settings to configure audio parameters and other settings
   */
  sendSessionSettings(settings: {
    sampleRate: number;
    channels: number;
    encoding: string;
    idleTimeout?: {
      warningTimeout?: number;
      hangupTimeout?: number;
      enabled?: boolean;
    };
  }): void {
    if (!this.isConnected()) {
      console.warn('[NextEVI] Cannot send session settings: WebSocket not connected');
      return;
    }

    const message = {
      type: 'session_settings',
      sample_rate: settings.sampleRate,
      channels: settings.channels,
      encoding: settings.encoding,
      ...(settings.idleTimeout && {
        idle_timeout: {
          warning_timeout: settings.idleTimeout.warningTimeout,
          hangup_timeout: settings.idleTimeout.hangupTimeout,
          enabled: settings.idleTimeout.enabled
        }
      })
    };

    if (this.config?.debug) {
      console.log('[NextEVI] 📤 Sending session settings:', message);
    }

    this.sendMessage(message);
    
    if (this.config?.debug) {
      console.log('[NextEVI] ✅ Session settings sent successfully');
    }
  }

  /**
   * Send binary audio data
   */
  sendAudioData(audioData: ArrayBuffer): void {
    if (!this.isConnected()) {
      console.warn('[NextEVI] Cannot send audio data: WebSocket not connected');
      return;
    }
    
    if (this.config?.debug) {
      console.log(`[NextEVI] 📤 Sending audio data: ${audioData.byteLength} bytes`);
      
      // Log first few bytes for debugging
      const firstBytes = new Uint8Array(audioData.slice(0, 8));
      console.log('[NextEVI] First 8 bytes:', Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
    
    try {
      this.websocket!.send(audioData);
      
      if (this.config?.debug) {
        console.log('[NextEVI] ✅ Audio data sent successfully');
      }
    } catch (error) {
      console.error('[NextEVI] ❌ Failed to send audio data:', error);
    }
  }

  /**
   * Send JSON message
   */
  sendMessage(message: WebSocketMessage): void {
    if (!this.isConnected()) return;
    
    try {
      const jsonMessage = JSON.stringify(message);
      this.websocket!.send(jsonMessage);
      
      if (this.config?.debug) {
        console.log('[NextEVI] Sent message:', message.type);
      }
    } catch (error) {
      console.error('[NextEVI] Failed to send message:', error);
    }
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.Connected && 
           this.websocket?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection ID
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  // Private methods
  
  private buildWebSocketUrl(config: NextEVIConfig): string {
    const baseUrl = config.websocketUrl || this.getDefaultWebSocketUrl();
    const params = new URLSearchParams();
    
    if (isAPIKeyAuth(config)) {
      params.set('api_key', config.apiKey);
      if (config.projectId) {
        params.set('project_id', config.projectId);
      }
    }
    
    params.set('config_id', config.configId);

    return `${baseUrl}/${this.connectionId}?${params.toString()}`;
  }

  private buildWebSocketUrlWithAuth(config: NextEVIConfig): { 
    wsUrl: string; 
    headers?: Record<string, string> 
  } {
    const baseUrl = config.websocketUrl || this.getDefaultWebSocketUrl();
    const params = new URLSearchParams();
    let headers: Record<string, string> = {};
    
    if (isJWTAuth(config)) {
      // For JWT authentication, we prefer Authorization header but fallback to query param
      // Since WebSocket doesn't support custom headers in browsers, we use query parameter
      params.set('authorization', `Bearer ${config.accessToken}`);
      headers['Authorization'] = `Bearer ${config.accessToken}`;
      
      // Project ID is optional for JWT auth
      if (config.projectId) {
        params.set('project_id', config.projectId);
      }
    } else if (isAPIKeyAuth(config)) {
      // API key authentication uses query parameters
      params.set('api_key', config.apiKey);
      if (config.projectId) {
        params.set('project_id', config.projectId);
      }
    }
    
    params.set('config_id', config.configId);
    
    return {
      wsUrl: `${baseUrl}/${this.connectionId}?${params.toString()}`,
      headers: Object.keys(headers).length > 0 ? headers : undefined
    };
  }

  private getDefaultWebSocketUrl(): string {
    // Use current location to determine WebSocket URL with proper API binding
    if (isBrowserEnvironment()) {
      const location = getLocationInfo();
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = location.hostname;
      const port = location.hostname === 'localhost' ? ':8001' : '';
      return `${protocol}//${host}${port}/ws/voice`;
    }
    
    // Fallback for server-side rendering
    return 'wss://api.nextevi.com/ws/voice';
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      
      if (this.config?.debug) {
        console.log('[NextEVI] Connection state changed:', state);
      }
      
      this.events.onStateChange?.(state);
    }
  }

  private handleOpen(event: Event): void {
    console.log('[NextEVI] WebSocket connected');
    this.reconnectAttempts = 0; // Reset reconnection counter
    this.setConnectionState(ConnectionState.Connected);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      // Handle JSON messages
      const message = JSON.parse(event.data) as WebSocketMessage;
      
      if (this.config?.debug) {
        console.log('[NextEVI] Received message:', message.type);
      }
      
      this.routeMessage(message);
      
    } catch (error) {
      // Handle binary messages or other non-JSON content
      if (this.config?.debug) {
        console.log('[NextEVI] Received binary data:', event.data);
      }
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('[NextEVI] WebSocket disconnected:', event.code, event.reason);
    
    this.websocket = null;
    
    // Handle different close codes
    if (event.code === 1000) {
      // Normal closure
      this.setConnectionState(ConnectionState.Disconnected);
    } else if (event.code >= 4000) {
      // Application-specific error codes (4000-4999)
      this.setConnectionState(ConnectionState.Error);
      this.events.onError?.(new NextEVIError(
        `Connection closed: ${event.reason}`,
        ErrorCode.WEBSOCKET_ERROR,
        { code: event.code, reason: event.reason }
      ));
    } else {
      // Network error or other issue - attempt reconnection
      this.attemptReconnection();
    }
  }

  private handleError(event: Event): void {
    console.error('[NextEVI] WebSocket error:', event);
    
    this.setConnectionState(ConnectionState.Error);
    this.events.onError?.(new NextEVIError(
      'WebSocket connection error',
      ErrorCode.WEBSOCKET_ERROR,
      event
    ));
  }

  private routeMessage(message: WebSocketMessage): void {
    // Enhanced debugging to track all message types
    if (this.config?.debug) {
      console.log('[NextEVI] 📨 Routing message:', message.type);
      if (message.type === 'emotion_update') {
        console.log('[NextEVI] 🎭 EMOTION UPDATE MESSAGE RECEIVED:', JSON.stringify(message, null, 2));
      }
    }

    switch (message.type) {
      case 'transcription':
        this.handleTranscriptionMessage(message);
        break;
        
      case 'tts_chunk':
        this.handleTTSChunkMessage(message);
        break;
        
      case 'llm_response_chunk':
        this.handleLLMChunkMessage(message);
        break;
        
      case 'emotion_update':
        console.log('[NextEVI] 🎭 Processing emotion_update message...');
        this.handleEmotionMessage(message);
        break;
        
      case 'connection_metadata':
        this.handleConnectionMetadata(message);
        break;
        
      case 'error':
        this.handleErrorMessage(message);
        break;
        
      case 'status':
        // Handle status updates
        if (this.config?.debug) {
          console.log('[NextEVI] Status update:', message);
        }
        break;
        
      case 'tts_interruption':
        this.handleInterruptionMessage(message);
        break;
        
      case 'system_message':
        this.handleSystemMessage(message);
        break;
        
      case 'turn_complete':
        this.handleTurnCompleteMessage(message);
        break;
        
      case 'idle_warning':
        this.handleIdleWarningMessage(message);
        break;
        
      default:
        console.log('[NextEVI] 📬 UNKNOWN MESSAGE TYPE:', message.type);
        console.log('[NextEVI] 📬 Full message:', JSON.stringify(message, null, 2));
        console.warn('[NextEVI] Unknown message type:', message.type);
    }
  }

  private handleTranscriptionMessage(message: any): void {
    const result: TranscriptionResult = {
      transcript: message.transcript || '',
      confidence: message.confidence || 0,
      isFinal: message.is_final || false,
      isInterim: !message.is_final,
      isSpeechFinal: message.is_speech_final,
      isUtteranceEnd: message.metadata?.event_type === 'utterance_end',
      words: message.words?.map((word: any) => ({
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: word.confidence
      })),
      metadata: {
        sessionId: message.session_id,
        eventType: message.metadata?.event_type || 'normal',
        processingTime: message.processing_time
      }
    };
    
    this.events.onTranscription?.(result);
  }

  private handleTTSChunkMessage(message: any): void {
    const chunk: TTSChunk = {
      content: message.content || '',
      chunkId: message.chunk_id,
      isLast: message.is_last || false
    };
    
    this.events.onTTSChunk?.(chunk);
  }

  private handleLLMChunkMessage(message: any): void {
    const chunk: LLMResponseChunk = {
      content: message.content || '',
      isFinal: message.is_final || false,
      generationId: message.generation_id,
      chunkIndex: message.chunk_index
    };
    
    this.events.onLLMChunk?.(chunk);
  }

  private handleEmotionMessage(message: any): void {
    if (this.config?.debug) {
      console.log('[NextEVI] 🎭 Raw emotion message received:', JSON.stringify(message, null, 2));
    }
    
    const emotions: EmotionData[] = message.top_emotions?.map((emotion: any) => ({
      emotion: emotion.emotion,
      percentage: emotion.percentage || (emotion.confidence ? emotion.confidence * 100 : 0)
    })) || [];
    
    if (this.config?.debug) {
      console.log('[NextEVI] 🎭 Parsed emotions:', emotions);
      console.log('[NextEVI] 🎭 Calling onEmotion handler with:', emotions.length, 'emotions');
    }
    
    if (emotions.length > 0) {
      this.events.onEmotion?.(emotions);
    } else {
      console.warn('[NextEVI] ⚠️ No emotions found in emotion_update message');
    }
  }

  private handleConnectionMetadata(message: any): void {
    const metadata: ConnectionMetadata = {
      connectionId: message.connection_id,
      status: message.status,
      config: message.config || {},
      projectId: message.project_id,
      configId: message.config_id
    };
    
    this.events.onConnectionMetadata?.(metadata);
  }

  private handleErrorMessage(message: any): void {
    const error = new NextEVIError(
      message.error_message || 'Unknown server error',
      message.error_code || ErrorCode.WEBSOCKET_ERROR,
      message
    );
    
    this.events.onError?.(error);
  }

  private handleInterruptionMessage(message: any): void {
    const interruption: InterruptionMessage = {
      type: 'tts_interruption',
      content: '',
      timestamp: message.timestamp || Date.now()
    };
    
    this.events.onInterruption?.(interruption);
    
    if (this.config?.debug) {
      console.log('[NextEVI] TTS interruption received');
    }
  }

  private handleSystemMessage(message: any): void {
    const systemMessage: SystemMessage = {
      type: 'system_message',
      content: message.content || '',
      messageType: message.message_type || 'initial',
      timestamp: message.timestamp || Date.now()
    };
    
    this.events.onSystemMessage?.(systemMessage);
    
    if (this.config?.debug) {
      console.log('[NextEVI] System message:', systemMessage.messageType, systemMessage.content);
    }
  }

  private handleTurnCompleteMessage(message: any): void {
    const turnResult: TurnDetectionResult = {
      isComplete: message.turn_result?.is_complete || false,
      confidence: message.turn_result?.confidence || 0,
      reasons: message.turn_result?.reasons || [],
      processingTime: message.turn_result?.processing_time
    };

    const turnComplete: TurnCompleteMessage = {
      type: 'turn_complete',
      turnResult,
      transcript: message.transcript || '',
      timestamp: message.timestamp || Date.now()
    };
    
    this.events.onTurnComplete?.(turnComplete);
    
    if (this.config?.debug) {
      console.log('[NextEVI] Turn complete:', turnResult.isComplete, turnResult.reasons);
    }
  }

  private handleIdleWarningMessage(message: any): void {
    const warning: IdleWarningMessage = {
      type: 'idle_warning',
      timeRemaining: message.time_remaining || 0,
      warningType: message.warning_type || 'warning',
      timestamp: message.timestamp || Date.now()
    };
    
    this.events.onIdleWarning?.(warning);
    
    if (this.config?.debug) {
      console.log('[NextEVI] Idle warning:', warning.warningType, `${warning.timeRemaining}s remaining`);
    }
  }

  private async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.config) {
      this.setConnectionState(ConnectionState.Error);
      this.events.onError?.(new NextEVIError(
        'Maximum reconnection attempts exceeded',
        ErrorCode.CONNECTION_FAILED
      ));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`[NextEVI] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (this.config) {
        this.connect(this.config).catch(error => {
          console.error('[NextEVI] Reconnection failed:', error);
        });
      }
    }, delay);
  }
}