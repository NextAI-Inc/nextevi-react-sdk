/**
 * WebSocket Connection Manager for NextEVI Voice SDK
 * Handles WebSocket connections, message routing, and connection state
 */

import {
  NextEVIConfig,
  ConnectionState,
  WebSocketMessage,
  TranscriptionResult,
  TTSChunk,
  LLMResponseChunk,
  EmotionData,
  ConnectionMetadata,
  NextEVIError,
  ErrorCode
} from '../types';

export interface WebSocketEvents {
  onStateChange: (state: ConnectionState) => void;
  onTranscription: (result: TranscriptionResult) => void;
  onTTSChunk: (chunk: TTSChunk) => void;
  onLLMChunk: (chunk: LLMResponseChunk) => void;
  onEmotion: (emotions: EmotionData[]) => void;
  onConnectionMetadata: (metadata: ConnectionMetadata) => void;
  onError: (error: NextEVIError) => void;
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
    if (this.connectionState === ConnectionState.Connected) {
      throw new NextEVIError('Already connected', ErrorCode.CONNECTION_FAILED);
    }

    this.config = config;
    this.connectionId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.setConnectionState(ConnectionState.Connecting);
      
      // Build WebSocket URL
      const wsUrl = this.buildWebSocketUrl(config);
      
      if (config.debug) {
        console.log('[NextEVI] Connecting to:', wsUrl);
      }

      // Create WebSocket connection
      this.websocket = new WebSocket(wsUrl);
      this.websocket.binaryType = 'arraybuffer';

      // Set up event handlers
      this.websocket.onopen = this.handleOpen;
      this.websocket.onmessage = this.handleMessage;
      this.websocket.onclose = this.handleClose;
      this.websocket.onerror = this.handleError;

      // Wait for connection to be established
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new NextEVIError('Connection timeout', ErrorCode.CONNECTION_FAILED));
        }, 10000);

        const originalOnStateChange = this.events.onStateChange;
        this.events.onStateChange = (state: ConnectionState) => {
          if (originalOnStateChange) originalOnStateChange(state);
          
          if (state === ConnectionState.Connected) {
            clearTimeout(timeout);
            this.events.onStateChange = originalOnStateChange;
            resolve();
          } else if (state === ConnectionState.Error) {
            clearTimeout(timeout);
            this.events.onStateChange = originalOnStateChange;
            reject(new NextEVIError('Connection failed', ErrorCode.CONNECTION_FAILED));
          }
        };
      });

    } catch (error) {
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
   * Send session settings to configure audio parameters
   */
  sendSessionSettings(sampleRate: number, channels: number, encoding: string): void {
    if (!this.isConnected()) return;

    const message = {
      type: 'session_settings',
      sample_rate: sampleRate,
      channels: channels,
      encoding: encoding
    };

    this.sendMessage(message);
  }

  /**
   * Send binary audio data
   */
  sendAudioData(audioData: ArrayBuffer): void {
    if (!this.isConnected()) return;
    
    if (this.config?.debug) {
      console.log(`[NextEVI] Sending audio data: ${audioData.byteLength} bytes`);
    }
    
    this.websocket!.send(audioData);
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
    const params = new URLSearchParams({
      api_key: config.apiKey,
      project_id: config.projectId,
      config_id: config.configId
    });

    return `${baseUrl}/${this.connectionId}?${params.toString()}`;
  }

  private getDefaultWebSocketUrl(): string {
    // Use current window location to determine WebSocket URL
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.hostname === 'localhost' ? ':8001' : '';
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
        // Handle TTS interruption
        if (this.config?.debug) {
          console.log('[NextEVI] TTS interrupted');
        }
        break;
        
      default:
        console.warn('[NextEVI] Unknown message type:', message.type);
    }
  }

  private handleTranscriptionMessage(message: any): void {
    const result: TranscriptionResult = {
      transcript: message.transcript || '',
      confidence: message.confidence || 0,
      isFinal: message.is_final || false,
      isInterim: !message.is_final,
      words: message.words?.map((word: any) => ({
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: word.confidence
      }))
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
    const emotions: EmotionData[] = message.top_emotions?.map((emotion: any) => ({
      emotion: emotion.emotion,
      percentage: emotion.percentage
    })) || [];
    
    this.events.onEmotion?.(emotions);
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