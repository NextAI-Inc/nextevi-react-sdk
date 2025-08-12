'use strict';

var jsxRuntime = require('react/jsx-runtime');
var react = require('react');

/**
 * NextEVI Voice React SDK - Type Definitions
 * Based on NextEVI backend API and inspired by Hume EVI patterns
 */
var ConnectionState;
(function (ConnectionState) {
    ConnectionState["Disconnected"] = "disconnected";
    ConnectionState["Connecting"] = "connecting";
    ConnectionState["Connected"] = "connected";
    ConnectionState["Error"] = "error";
})(ConnectionState || (ConnectionState = {}));
// Error Types
class NextEVIError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'NextEVIError';
    }
}
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    ErrorCode["AUTHENTICATION_FAILED"] = "AUTHENTICATION_FAILED";
    ErrorCode["AUDIO_INITIALIZATION_FAILED"] = "AUDIO_INITIALIZATION_FAILED";
    ErrorCode["MICROPHONE_ACCESS_DENIED"] = "MICROPHONE_ACCESS_DENIED";
    ErrorCode["WEBSOCKET_ERROR"] = "WEBSOCKET_ERROR";
    ErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
})(ErrorCode || (ErrorCode = {}));

/**
 * WebSocket Connection Manager for NextEVI Voice SDK
 * Handles WebSocket connections, message routing, and connection state
 */
class WebSocketManager {
    constructor() {
        this.websocket = null;
        this.config = null;
        this.connectionState = ConnectionState.Disconnected;
        this.connectionId = null;
        this.events = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 1000; // Start with 1 second
        // Bind methods to preserve 'this' context
        this.handleOpen = this.handleOpen.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
    }
    /**
     * Set event handlers for WebSocket events
     */
    setEvents(events) {
        this.events = { ...this.events, ...events };
    }
    /**
     * Connect to NextEVI voice service
     */
    async connect(config) {
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
                this.events.onStateChange = (state) => {
                    if (originalOnStateChange)
                        originalOnStateChange(state);
                    if (state === ConnectionState.Connected) {
                        clearTimeout(timeout);
                        this.events.onStateChange = originalOnStateChange;
                        resolve();
                    }
                    else if (state === ConnectionState.Error) {
                        clearTimeout(timeout);
                        this.events.onStateChange = originalOnStateChange;
                        reject(new NextEVIError('Connection failed', ErrorCode.CONNECTION_FAILED));
                    }
                };
            });
        }
        catch (error) {
            this.setConnectionState(ConnectionState.Error);
            throw new NextEVIError(`Connection failed: ${error.message}`, ErrorCode.CONNECTION_FAILED, error);
        }
    }
    /**
     * Disconnect from service
     */
    async disconnect() {
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
    sendSessionSettings(sampleRate, channels, encoding) {
        if (!this.isConnected())
            return;
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
    sendAudioData(audioData) {
        if (!this.isConnected())
            return;
        if (this.config?.debug) {
            console.log(`[NextEVI] Sending audio data: ${audioData.byteLength} bytes`);
        }
        this.websocket.send(audioData);
    }
    /**
     * Send JSON message
     */
    sendMessage(message) {
        if (!this.isConnected())
            return;
        try {
            const jsonMessage = JSON.stringify(message);
            this.websocket.send(jsonMessage);
            if (this.config?.debug) {
                console.log('[NextEVI] Sent message:', message.type);
            }
        }
        catch (error) {
            console.error('[NextEVI] Failed to send message:', error);
        }
    }
    /**
     * Get current connection state
     */
    getConnectionState() {
        return this.connectionState;
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connectionState === ConnectionState.Connected &&
            this.websocket?.readyState === WebSocket.OPEN;
    }
    /**
     * Get connection ID
     */
    getConnectionId() {
        return this.connectionId;
    }
    // Private methods
    buildWebSocketUrl(config) {
        const baseUrl = config.websocketUrl || this.getDefaultWebSocketUrl();
        const params = new URLSearchParams({
            api_key: config.apiKey,
            project_id: config.projectId,
            config_id: config.configId
        });
        return `${baseUrl}/${this.connectionId}?${params.toString()}`;
    }
    getDefaultWebSocketUrl() {
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
    setConnectionState(state) {
        if (this.connectionState !== state) {
            this.connectionState = state;
            if (this.config?.debug) {
                console.log('[NextEVI] Connection state changed:', state);
            }
            this.events.onStateChange?.(state);
        }
    }
    handleOpen(event) {
        console.log('[NextEVI] WebSocket connected');
        this.reconnectAttempts = 0; // Reset reconnection counter
        this.setConnectionState(ConnectionState.Connected);
    }
    handleMessage(event) {
        try {
            // Handle JSON messages
            const message = JSON.parse(event.data);
            if (this.config?.debug) {
                console.log('[NextEVI] Received message:', message.type);
            }
            this.routeMessage(message);
        }
        catch (error) {
            // Handle binary messages or other non-JSON content
            if (this.config?.debug) {
                console.log('[NextEVI] Received binary data:', event.data);
            }
        }
    }
    handleClose(event) {
        console.log('[NextEVI] WebSocket disconnected:', event.code, event.reason);
        this.websocket = null;
        // Handle different close codes
        if (event.code === 1000) {
            // Normal closure
            this.setConnectionState(ConnectionState.Disconnected);
        }
        else if (event.code >= 4000) {
            // Application-specific error codes (4000-4999)
            this.setConnectionState(ConnectionState.Error);
            this.events.onError?.(new NextEVIError(`Connection closed: ${event.reason}`, ErrorCode.WEBSOCKET_ERROR, { code: event.code, reason: event.reason }));
        }
        else {
            // Network error or other issue - attempt reconnection
            this.attemptReconnection();
        }
    }
    handleError(event) {
        console.error('[NextEVI] WebSocket error:', event);
        this.setConnectionState(ConnectionState.Error);
        this.events.onError?.(new NextEVIError('WebSocket connection error', ErrorCode.WEBSOCKET_ERROR, event));
    }
    routeMessage(message) {
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
    handleTranscriptionMessage(message) {
        const result = {
            transcript: message.transcript || '',
            confidence: message.confidence || 0,
            isFinal: message.is_final || false,
            isInterim: !message.is_final,
            words: message.words?.map((word) => ({
                word: word.word,
                start: word.start,
                end: word.end,
                confidence: word.confidence
            }))
        };
        this.events.onTranscription?.(result);
    }
    handleTTSChunkMessage(message) {
        const chunk = {
            content: message.content || '',
            chunkId: message.chunk_id,
            isLast: message.is_last || false
        };
        this.events.onTTSChunk?.(chunk);
    }
    handleLLMChunkMessage(message) {
        const chunk = {
            content: message.content || '',
            isFinal: message.is_final || false,
            generationId: message.generation_id,
            chunkIndex: message.chunk_index
        };
        this.events.onLLMChunk?.(chunk);
    }
    handleEmotionMessage(message) {
        const emotions = message.top_emotions?.map((emotion) => ({
            emotion: emotion.emotion,
            percentage: emotion.percentage
        })) || [];
        this.events.onEmotion?.(emotions);
    }
    handleConnectionMetadata(message) {
        const metadata = {
            connectionId: message.connection_id,
            status: message.status,
            config: message.config || {},
            projectId: message.project_id,
            configId: message.config_id
        };
        this.events.onConnectionMetadata?.(metadata);
    }
    handleErrorMessage(message) {
        const error = new NextEVIError(message.error_message || 'Unknown server error', message.error_code || ErrorCode.WEBSOCKET_ERROR, message);
        this.events.onError?.(error);
    }
    async attemptReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts || !this.config) {
            this.setConnectionState(ConnectionState.Error);
            this.events.onError?.(new NextEVIError('Maximum reconnection attempts exceeded', ErrorCode.CONNECTION_FAILED));
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

/**
 * Audio Processing Utilities for NextEVI Voice SDK
 * Handles microphone capture, PCM conversion, and TTS playback using AudioWorklet
 */
class AudioManager {
    constructor(config = {}) {
        this.mediaStream = null;
        this.audioContext = null;
        this.ttsAudioContext = null;
        this.micWorkletNode = null;
        this.ttsWorkletNode = null;
        this.isRecording = false;
        this.isTTSPlaying = false;
        this.events = {};
        this.config = {
            sampleRate: 24000,
            channels: 1,
            encoding: 'linear16',
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
            ...config
        };
    }
    /**
     * Set event handlers
     */
    setEvents(events) {
        this.events = { ...this.events, ...events };
    }
    /**
     * Initialize audio processing
     */
    async initialize() {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: { ideal: this.config.sampleRate },
                    channelCount: this.config.channels,
                    echoCancellation: this.config.echoCancellation,
                    noiseSuppression: this.config.noiseSuppression,
                    autoGainControl: this.config.autoGainControl
                }
            });
            // Create audio contexts
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.config.sampleRate,
                latencyHint: 'interactive'
            });
            this.ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.config.sampleRate,
                latencyHint: 'interactive'
            });
            // Resume contexts if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            if (this.ttsAudioContext.state === 'suspended') {
                await this.ttsAudioContext.resume();
            }
            // Load AudioWorklet processors
            await this.loadWorkletProcessors();
            console.log('[NextEVI] Audio manager initialized successfully');
            return true;
        }
        catch (error) {
            const audioError = new NextEVIError(`Failed to initialize audio: ${error.message}`, error.name === 'NotAllowedError' ? ErrorCode.MICROPHONE_ACCESS_DENIED : ErrorCode.AUDIO_INITIALIZATION_FAILED, error);
            this.events.onError?.(audioError);
            return false;
        }
    }
    /**
     * Start audio capture and processing
     */
    async start() {
        if (!this.audioContext || !this.mediaStream) {
            return false;
        }
        try {
            // Create and configure microphone worklet node
            this.micWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');
            // Handle audio data from worklet
            this.micWorkletNode.port.onmessage = ({ data }) => {
                if (this.isRecording && data instanceof ArrayBuffer) {
                    this.events.onAudioData?.(data);
                }
            };
            // Connect media stream to worklet
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            source.connect(this.micWorkletNode);
            // Create and configure TTS playback worklet node
            this.ttsWorkletNode = new AudioWorkletNode(this.ttsAudioContext, 'tts-playback-processor');
            // Handle TTS playback events
            this.ttsWorkletNode.port.onmessage = ({ data }) => {
                if (data.type === 'playbackStarted') {
                    this.isTTSPlaying = true;
                    this.events.onTTSPlayback?.(true);
                }
                else if (data.type === 'playbackStopped') {
                    this.isTTSPlaying = false;
                    this.events.onTTSPlayback?.(false);
                }
            };
            // Connect TTS worklet to audio output
            this.ttsWorkletNode.connect(this.ttsAudioContext.destination);
            this.isRecording = true;
            console.log('[NextEVI] Audio capture started');
            return true;
        }
        catch (error) {
            const audioError = new NextEVIError(`Failed to start audio processing: ${error.message}`, ErrorCode.AUDIO_INITIALIZATION_FAILED, error);
            this.events.onError?.(audioError);
            return false;
        }
    }
    /**
     * Stop audio capture
     */
    async stop() {
        this.isRecording = false;
        if (this.micWorkletNode) {
            this.micWorkletNode.disconnect();
            this.micWorkletNode = null;
        }
        console.log('[NextEVI] Audio capture stopped');
    }
    /**
     * Play TTS audio chunk
     */
    playTTSChunk(audioData) {
        if (!this.ttsWorkletNode) {
            console.warn('[NextEVI] TTS worklet not initialized');
            return;
        }
        try {
            // Convert base64 to Int16Array
            const pcmData = this.base64ToInt16Array(audioData);
            // Send PCM data to TTS worklet
            this.ttsWorkletNode.port.postMessage(pcmData);
        }
        catch (error) {
            console.error('[NextEVI] Failed to play TTS chunk:', error);
        }
    }
    /**
     * Clear TTS audio buffer (for interruptions)
     */
    clearTTSBuffer() {
        if (this.ttsWorkletNode) {
            this.ttsWorkletNode.port.postMessage({ type: 'clear' });
        }
    }
    /**
     * Check if actively recording
     */
    isActive() {
        return this.isRecording;
    }
    /**
     * Check if TTS is playing
     */
    isTTSActive() {
        return this.isTTSPlaying;
    }
    /**
     * Get current audio configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Cleanup resources
     */
    async cleanup() {
        this.isRecording = false;
        this.isTTSPlaying = false;
        // Stop microphone worklet
        if (this.micWorkletNode) {
            this.micWorkletNode.disconnect();
            this.micWorkletNode = null;
        }
        // Stop TTS worklet
        if (this.ttsWorkletNode) {
            this.ttsWorkletNode.disconnect();
            this.ttsWorkletNode = null;
        }
        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        // Close audio contexts
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        if (this.ttsAudioContext) {
            await this.ttsAudioContext.close();
            this.ttsAudioContext = null;
        }
        console.log('[NextEVI] Audio manager cleaned up');
    }
    // Private methods
    async loadWorkletProcessors() {
        if (!this.audioContext || !this.ttsAudioContext) {
            throw new Error('Audio contexts not initialized');
        }
        // Load PCM capture processor
        const pcmProcessorCode = this.getPCMProcessorCode();
        const pcmBlob = new Blob([pcmProcessorCode], { type: 'application/javascript' });
        const pcmProcessorUrl = URL.createObjectURL(pcmBlob);
        await this.audioContext.audioWorklet.addModule(pcmProcessorUrl);
        URL.revokeObjectURL(pcmProcessorUrl);
        // Load TTS playback processor
        const ttsProcessorCode = this.getTTSProcessorCode();
        const ttsBlob = new Blob([ttsProcessorCode], { type: 'application/javascript' });
        const ttsProcessorUrl = URL.createObjectURL(ttsBlob);
        await this.ttsAudioContext.audioWorklet.addModule(ttsProcessorUrl);
        URL.revokeObjectURL(ttsProcessorUrl);
    }
    getPCMProcessorCode() {
        return `
      class PCMCaptureProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.chunkSize = 2048;
          this.buffer = new Float32Array(this.chunkSize);
          this.bufferIndex = 0;
        }
        
        process(inputs) {
          const input = inputs[0];
          
          if (!input || input.length === 0) {
            return true;
          }
          
          const channelData = input[0];
          
          if (!channelData || channelData.length === 0) {
            return true;
          }
          
          for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex] = channelData[i];
            this.bufferIndex++;
            
            if (this.bufferIndex >= this.chunkSize) {
              this.sendAudioChunk();
              this.bufferIndex = 0;
            }
          }
          
          return true;
        }
        
        sendAudioChunk() {
          const pcmData = this.float32ToPCM16(this.buffer);
          this.port.postMessage(pcmData.buffer);
        }
        
        float32ToPCM16(float32Array) {
          const pcm16Array = new Int16Array(float32Array.length);
          
          for (let i = 0; i < float32Array.length; i++) {
            let sample = Math.max(-1.0, Math.min(1.0, float32Array[i]));
            pcm16Array[i] = sample < 0 ? sample * 32768 : sample * 32767;
          }
          
          return pcm16Array;
        }
      }
      
      registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
    `;
    }
    getTTSProcessorCode() {
        return `
      class TTSPlaybackProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.bufferQueue = [];
          this.readOffset = 0;
          this.samplesRemaining = 0;
          this.isPlaying = false;

          this.port.onmessage = (event) => {
            if (event.data && typeof event.data === "object" && event.data.type === "clear") {
              this.bufferQueue = [];
              this.readOffset = 0;
              this.samplesRemaining = 0;
              this.isPlaying = false;
              return;
            }
            
            this.bufferQueue.push(event.data);
            this.samplesRemaining += event.data.length;
          };
        }

        process(inputs, outputs) {
          const outputChannel = outputs[0][0];

          if (this.samplesRemaining === 0) {
            outputChannel.fill(0);
            if (this.isPlaying) {
              this.isPlaying = false;
              this.port.postMessage({ type: 'playbackStopped' });
            }
            return true;
          }

          if (!this.isPlaying) {
            this.isPlaying = true;
            this.port.postMessage({ type: 'playbackStarted' });
          }

          let outIdx = 0;
          while (outIdx < outputChannel.length && this.bufferQueue.length > 0) {
            const currentBuffer = this.bufferQueue[0];
            const sampleValue = currentBuffer[this.readOffset] / 32768;
            outputChannel[outIdx++] = sampleValue;

            this.readOffset++;
            this.samplesRemaining--;

            if (this.readOffset >= currentBuffer.length) {
              this.bufferQueue.shift();
              this.readOffset = 0;
            }
          }

          while (outIdx < outputChannel.length) {
            outputChannel[outIdx++] = 0;
          }

          return true;
        }
      }
      
      registerProcessor('tts-playback-processor', TTSPlaybackProcessor);
    `;
    }
    base64ToInt16Array(base64) {
        const raw = atob(base64);
        const buffer = new ArrayBuffer(raw.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < raw.length; i++) {
            view[i] = raw.charCodeAt(i);
        }
        return new Int16Array(buffer);
    }
}
/**
 * Utility function to check if the browser supports the required audio APIs
 */
function isAudioSupported() {
    return !!(navigator.mediaDevices &&
        'getUserMedia' in (navigator.mediaDevices || {}) &&
        window.AudioContext &&
        window.AudioContext.prototype.audioWorklet);
}
/**
 * Utility function to request microphone permissions
 */
async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    }
    catch (error) {
        console.error('[NextEVI] Microphone permission denied:', error);
        return false;
    }
}

/**
 * Authentication utilities for NextEVI Voice SDK
 * Handles API key validation and connection authentication
 */
/**
 * Validate NextEVI API key format
 */
function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return false;
    }
    // NextEVI API keys start with 'oak_' prefix
    return apiKey.startsWith('oak_') && apiKey.length > 10;
}
/**
 * Validate project ID format
 */
function validateProjectId(projectId) {
    if (!projectId || typeof projectId !== 'string') {
        return false;
    }
    // Project IDs should be non-empty strings
    return projectId.trim().length > 0;
}
/**
 * Validate config ID format
 */
function validateConfigId(configId) {
    if (!configId || typeof configId !== 'string') {
        return false;
    }
    // Config IDs should be non-empty strings
    return configId.trim().length > 0;
}
/**
 * Validate complete NextEVI configuration
 */
function validateConfig(config) {
    const errors = [];
    if (!validateApiKey(config.apiKey)) {
        errors.push('Invalid API key format. API key must start with "oak_"');
    }
    if (!validateProjectId(config.projectId)) {
        errors.push('Invalid project ID. Project ID cannot be empty');
    }
    if (!validateConfigId(config.configId)) {
        errors.push('Invalid config ID. Config ID cannot be empty');
    }
    if (config.websocketUrl && !isValidWebSocketUrl(config.websocketUrl)) {
        errors.push('Invalid WebSocket URL format');
    }
    if (errors.length > 0) {
        throw new NextEVIError(`Configuration validation failed: ${errors.join(', ')}`, ErrorCode.INVALID_CONFIG, { errors });
    }
}
/**
 * Validate WebSocket URL format
 */
function isValidWebSocketUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    }
    catch {
        return false;
    }
}
/**
 * Sanitize configuration for logging (hide sensitive data)
 */
function sanitizeConfigForLogging(config) {
    return {
        ...config,
        apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : undefined
    };
}
/**
 * Check if running in development environment
 */
function isDevelopment() {
    return process.env.NODE_ENV === 'development' ||
        (typeof window !== 'undefined' && window.location.hostname === 'localhost');
}
/**
 * Get default WebSocket URL based on environment
 */
function getDefaultWebSocketUrl() {
    if (typeof window === 'undefined') {
        // Server-side rendering fallback
        return 'wss://api.nextevi.com/ws/voice';
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Development environment
        return `${protocol}//${hostname}:8001/ws/voice`;
    }
    else {
        // Production environment
        return `${protocol}//${hostname}/ws/voice`;
    }
}
/**
 * Create a connection configuration with defaults
 */
function createConnectionConfig(apiKey, projectId, configId, options = {}) {
    const config = {
        apiKey: apiKey.trim(),
        projectId: projectId.trim(),
        configId: configId.trim(),
        websocketUrl: options.websocketUrl || getDefaultWebSocketUrl(),
        debug: options.debug || isDevelopment(),
        ...options
    };
    // Validate the configuration
    validateConfig(config);
    return config;
}
/**
 * Parse NextEVI configuration from environment variables
 * Useful for server-side applications
 */
function configFromEnvironment() {
    const config = {};
    // Check for common environment variable names
    if (process.env.NEXTEVI_API_KEY) {
        config.apiKey = process.env.NEXTEVI_API_KEY;
    }
    if (process.env.NEXTEVI_PROJECT_ID) {
        config.projectId = process.env.NEXTEVI_PROJECT_ID;
    }
    if (process.env.NEXTEVI_CONFIG_ID) {
        config.configId = process.env.NEXTEVI_CONFIG_ID;
    }
    if (process.env.NEXTEVI_WEBSOCKET_URL) {
        config.websocketUrl = process.env.NEXTEVI_WEBSOCKET_URL;
    }
    if (process.env.NEXTEVI_DEBUG) {
        config.debug = process.env.NEXTEVI_DEBUG === 'true';
    }
    return config;
}
/**
 * Utility to mask sensitive information in API keys for logging
 */
function maskApiKey(apiKey) {
    if (!apiKey || apiKey.length < 8) {
        return '*'.repeat(apiKey.length || 0);
    }
    return apiKey.substring(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.substring(apiKey.length - 4);
}
/**
 * Generate a unique connection ID for tracking
 */
function generateConnectionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `voice_${timestamp}_${random}`;
}
/**
 * Check if the current environment supports the NextEVI SDK
 */
function isEnvironmentSupported() {
    if (typeof window === 'undefined') {
        return false; // Server-side environment
    }
    const requiredFeatures = [
        'WebSocket' in window,
        'AudioContext' in window || 'webkitAudioContext' in window,
        'navigator' in window && 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
        'AudioWorkletNode' in window
    ];
    return requiredFeatures.every(feature => feature);
}
/**
 * Get browser compatibility information
 */
function getBrowserInfo() {
    const missingFeatures = [];
    if (typeof window === 'undefined') {
        return {
            isSupported: false,
            missingFeatures: ['Browser environment required'],
            userAgent: 'Server-side'
        };
    }
    if (!('WebSocket' in window)) {
        missingFeatures.push('WebSocket');
    }
    if (!('AudioContext' in window) && !('webkitAudioContext' in window)) {
        missingFeatures.push('AudioContext');
    }
    if (!('navigator' in window) ||
        !('mediaDevices' in navigator) ||
        !('getUserMedia' in navigator.mediaDevices)) {
        missingFeatures.push('getUserMedia');
    }
    if (!('AudioWorkletNode' in window)) {
        missingFeatures.push('AudioWorkletNode');
    }
    return {
        isSupported: missingFeatures.length === 0,
        missingFeatures,
        userAgent: navigator.userAgent
    };
}

// Initial state
const initialState = {
    readyState: ConnectionState.Disconnected,
    messages: [],
    isRecording: false,
    isTTSPlaying: false,
    isWaitingForResponse: false,
    connectionMetadata: undefined,
    error: undefined
};
// State reducer
function voiceReducer(state, action) {
    switch (action.type) {
        case 'SET_CONNECTION_STATE':
            return { ...state, readyState: action.payload, error: null };
        case 'SET_RECORDING':
            return { ...state, isRecording: action.payload };
        case 'SET_TTS_PLAYING':
            return { ...state, isTTSPlaying: action.payload };
        case 'SET_WAITING_FOR_RESPONSE':
            return { ...state, isWaitingForResponse: action.payload };
        case 'ADD_MESSAGE':
            return { ...state, messages: [...state.messages, action.payload] };
        case 'UPDATE_STREAMING_MESSAGE': {
            const messages = [...state.messages];
            const lastIndex = messages.length - 1;
            // Update or create streaming message
            if (lastIndex >= 0 &&
                messages[lastIndex].type === action.payload.type &&
                messages[lastIndex].metadata?.isStreaming) {
                messages[lastIndex] = {
                    ...messages[lastIndex],
                    content: action.payload.content,
                    timestamp: new Date()
                };
            }
            else {
                // Create new streaming message
                messages.push({
                    id: `streaming_${Date.now()}`,
                    type: action.payload.type,
                    content: action.payload.content,
                    timestamp: new Date(),
                    metadata: { isStreaming: true }
                });
            }
            return { ...state, messages };
        }
        case 'FINALIZE_STREAMING_MESSAGE': {
            const messages = state.messages.map(msg => msg.id === action.payload.id
                ? {
                    ...msg,
                    content: action.payload.content,
                    metadata: { ...msg.metadata, isStreaming: false }
                }
                : msg);
            return { ...state, messages };
        }
        case 'CLEAR_MESSAGES':
            return { ...state, messages: [] };
        case 'SET_CONNECTION_METADATA':
            return { ...state, connectionMetadata: action.payload };
        case 'SET_ERROR':
            return { ...state, error: action.payload };
        case 'RESET_STATE':
            return { ...initialState };
        default:
            return state;
    }
}
// Create context
const VoiceContext = react.createContext(null);
// Provider component
function VoiceProvider({ children, debug = false }) {
    const [state, dispatch] = react.useReducer(voiceReducer, initialState);
    const wsManagerRef = react.useRef(null);
    const audioManagerRef = react.useRef(null);
    const currentStreamingMessageId = react.useRef(null);
    // Check environment support on mount
    react.useEffect(() => {
        if (!isEnvironmentSupported()) {
            const error = new NextEVIError('NextEVI SDK is not supported in this environment', ErrorCode.AUDIO_INITIALIZATION_FAILED);
            dispatch({ type: 'SET_ERROR', payload: error.message });
            console.error('[NextEVI] Environment not supported:', error);
        }
    }, []);
    // Generate unique message ID
    const generateMessageId = react.useCallback(() => {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }, []);
    // Add message to conversation
    const addMessage = react.useCallback((type, content, metadata) => {
        const message = {
            id: generateMessageId(),
            type,
            content,
            timestamp: new Date(),
            metadata
        };
        dispatch({ type: 'ADD_MESSAGE', payload: message });
        if (debug) {
            console.log('[NextEVI] Added message:', message);
        }
    }, [generateMessageId, debug]);
    // WebSocket event handlers
    const wsEvents = {
        onStateChange: (connectionState) => {
            dispatch({ type: 'SET_CONNECTION_STATE', payload: connectionState });
            if (debug) {
                console.log('[NextEVI] Connection state changed:', connectionState);
            }
        },
        onTranscription: (result) => {
            if (result.isFinal && result.transcript.trim()) {
                // Final transcription - add as user message
                addMessage('user', result.transcript, {
                    confidence: result.confidence,
                    isFinal: true
                });
                dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: true });
            }
            else if (result.transcript.trim()) {
                // Interim transcription - update streaming message
                dispatch({
                    type: 'UPDATE_STREAMING_MESSAGE',
                    payload: { content: result.transcript, type: 'user' }
                });
            }
            if (debug) {
                console.log('[NextEVI] Transcription:', result);
            }
        },
        onTTSChunk: (chunk) => {
            // Play TTS audio chunk
            if (audioManagerRef.current && chunk.content) {
                audioManagerRef.current.playTTSChunk(chunk.content);
            }
            if (debug) {
                console.log('[NextEVI] TTS chunk received');
            }
        },
        onLLMChunk: (chunk) => {
            if (chunk.isFinal) {
                // Final LLM response
                if (currentStreamingMessageId.current) {
                    dispatch({
                        type: 'FINALIZE_STREAMING_MESSAGE',
                        payload: {
                            id: currentStreamingMessageId.current,
                            content: chunk.content
                        }
                    });
                    currentStreamingMessageId.current = null;
                }
                else {
                    addMessage('assistant', chunk.content, {
                        generationId: chunk.generationId,
                        isFinal: true
                    });
                }
                dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: false });
            }
            else {
                // Streaming LLM response
                if (!currentStreamingMessageId.current) {
                    currentStreamingMessageId.current = generateMessageId();
                }
                dispatch({
                    type: 'UPDATE_STREAMING_MESSAGE',
                    payload: { content: chunk.content, type: 'assistant' }
                });
            }
            if (debug) {
                console.log('[NextEVI] LLM chunk:', { content: chunk.content.substring(0, 50), isFinal: chunk.isFinal });
            }
        },
        onEmotion: (emotions) => {
            // Add emotion data to the last user message
            if (state.messages.length > 0) {
                const lastUserMessage = [...state.messages].reverse().find(msg => msg.type === 'user');
                if (lastUserMessage && !lastUserMessage.metadata?.emotions) {
                    // Update message with emotion data
                    state.messages.map(msg => msg.id === lastUserMessage.id
                        ? { ...msg, metadata: { ...msg.metadata, emotions } }
                        : msg);
                    // Note: This is a side effect - in a real implementation, you might want to handle this differently
                }
            }
            if (debug) {
                console.log('[NextEVI] Emotions detected:', emotions);
            }
        },
        onConnectionMetadata: (metadata) => {
            dispatch({ type: 'SET_CONNECTION_METADATA', payload: metadata });
            if (debug) {
                console.log('[NextEVI] Connection metadata:', metadata);
            }
        },
        onError: (error) => {
            dispatch({ type: 'SET_ERROR', payload: error.message });
            addMessage('error', `Error: ${error.message}`);
            console.error('[NextEVI] Error:', error);
        }
    };
    // Audio event handlers
    const audioEvents = {
        onAudioData: (data) => {
            // Send audio data through WebSocket
            if (wsManagerRef.current && wsManagerRef.current.isConnected()) {
                wsManagerRef.current.sendAudioData(data);
            }
        },
        onTTSPlayback: (isPlaying) => {
            dispatch({ type: 'SET_TTS_PLAYING', payload: isPlaying });
        },
        onError: (error) => {
            dispatch({ type: 'SET_ERROR', payload: error.message });
            addMessage('error', `Audio Error: ${error.message}`);
            console.error('[NextEVI] Audio error:', error);
        }
    };
    // Connect to NextEVI service
    const connect = react.useCallback(async (config) => {
        try {
            // Validate configuration
            validateConfig(config.auth);
            if (debug) {
                console.log('[NextEVI] Connecting with config:', sanitizeConfigForLogging(config.auth));
            }
            // Check audio support
            if (!isAudioSupported()) {
                throw new NextEVIError('Audio features not supported in this browser', ErrorCode.AUDIO_INITIALIZATION_FAILED);
            }
            // Initialize WebSocket manager
            if (!wsManagerRef.current) {
                wsManagerRef.current = new WebSocketManager();
                wsManagerRef.current.setEvents(wsEvents);
            }
            // Initialize audio manager
            if (!audioManagerRef.current) {
                audioManagerRef.current = new AudioManager(config.audioConfig);
                audioManagerRef.current.setEvents(audioEvents);
            }
            // Initialize audio processing
            const audioInitialized = await audioManagerRef.current.initialize();
            if (!audioInitialized) {
                throw new NextEVIError('Failed to initialize audio processing', ErrorCode.AUDIO_INITIALIZATION_FAILED);
            }
            // Connect WebSocket
            await wsManagerRef.current.connect(config.auth);
            // Send session settings
            const audioConfig = audioManagerRef.current.getConfig();
            wsManagerRef.current.sendSessionSettings(audioConfig.sampleRate || 24000, audioConfig.channels || 1, audioConfig.encoding || 'linear16');
            // Start audio processing
            const audioStarted = await audioManagerRef.current.start();
            if (!audioStarted) {
                throw new NextEVIError('Failed to start audio capture', ErrorCode.AUDIO_INITIALIZATION_FAILED);
            }
            dispatch({ type: 'SET_RECORDING', payload: true });
            addMessage('system', 'Connected to NextEVI. Start speaking!');
            if (debug) {
                console.log('[NextEVI] Successfully connected and ready');
            }
        }
        catch (error) {
            const nextEVIError = error instanceof NextEVIError
                ? error
                : new NextEVIError(`Connection failed: ${error.message}`, ErrorCode.CONNECTION_FAILED, error);
            dispatch({ type: 'SET_ERROR', payload: nextEVIError.message });
            addMessage('error', nextEVIError.message);
            // Cleanup on failure
            await cleanup();
            throw nextEVIError;
        }
    }, [debug, wsEvents, audioEvents, addMessage]);
    // Disconnect from service
    const disconnect = react.useCallback(async () => {
        if (debug) {
            console.log('[NextEVI] Disconnecting...');
        }
        await cleanup();
        dispatch({ type: 'RESET_STATE' });
        if (debug) {
            console.log('[NextEVI] Disconnected');
        }
    }, [debug]);
    // Cleanup resources
    const cleanup = react.useCallback(async () => {
        // Stop audio processing
        if (audioManagerRef.current) {
            await audioManagerRef.current.cleanup();
            audioManagerRef.current = null;
        }
        // Close WebSocket connection
        if (wsManagerRef.current) {
            await wsManagerRef.current.disconnect();
            wsManagerRef.current = null;
        }
        dispatch({ type: 'SET_RECORDING', payload: false });
        dispatch({ type: 'SET_TTS_PLAYING', payload: false });
        dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: false });
        currentStreamingMessageId.current = null;
    }, []);
    // Clear conversation messages
    const clearMessages = react.useCallback(() => {
        dispatch({ type: 'CLEAR_MESSAGES' });
        if (debug) {
            console.log('[NextEVI] Messages cleared');
        }
    }, [debug]);
    // Send text message (for testing)
    const sendMessage = react.useCallback((content) => {
        addMessage('user', content);
        if (debug) {
            console.log('[NextEVI] Sent text message:', content);
        }
    }, [addMessage, debug]);
    // Cleanup on unmount
    react.useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);
    // Context value
    const contextValue = {
        ...state,
        connect,
        disconnect,
        clearMessages,
        sendMessage
    };
    return (jsxRuntime.jsx(VoiceContext.Provider, { value: contextValue, children: children }));
}
// Custom hook to use the voice context
function useVoiceContext() {
    const context = react.useContext(VoiceContext);
    if (!context) {
        throw new Error('useVoiceContext must be used within a VoiceProvider');
    }
    return context;
}

/**
 * useVoice Hook - Main API for NextEVI Voice SDK
 * Provides a Hume-style interface for voice interactions
 */
/**
 * Main hook for NextEVI Voice interactions
 *
 * Usage:
 * ```tsx
 * const { connect, disconnect, readyState, messages } = useVoice();
 *
 * // Connect to NextEVI
 * await connect({
 *   auth: {
 *     apiKey: "oak_...",
 *     projectId: "my-project",
 *     configId: "my-config"
 *   }
 * });
 * ```
 */
function useVoice(options = {}) {
    const context = useVoiceContext();
    const { debug = false, audioConfig, autoClearMessages = false } = options;
    // Enhanced connect method with additional options
    const connect = react.useCallback(async (config) => {
        // Clear messages if auto-clear is enabled
        if (autoClearMessages && context.messages.length > 0) {
            context.clearMessages();
        }
        // Merge audio config from options
        const enhancedConfig = {
            ...config,
            audioConfig: {
                ...audioConfig,
                ...config.audioConfig
            }
        };
        // Set debug mode if specified in options
        if (debug && !enhancedConfig.auth.debug) {
            enhancedConfig.auth = {
                ...enhancedConfig.auth,
                debug: true
            };
        }
        return context.connect(enhancedConfig);
    }, [context, audioConfig, autoClearMessages, debug]);
    // Return the complete API
    return {
        // State
        readyState: context.readyState,
        messages: context.messages,
        isRecording: context.isRecording,
        isTTSPlaying: context.isTTSPlaying,
        isWaitingForResponse: context.isWaitingForResponse,
        connectionMetadata: context.connectionMetadata,
        error: context.error,
        // Actions
        connect,
        disconnect: context.disconnect,
        clearMessages: context.clearMessages,
        sendMessage: context.sendMessage
    };
}
/**
 * Simplified connection helper that creates a config from individual parameters
 */
function useSimpleVoice(options = {}) {
    const voice = useVoice(options);
    const connectSimple = react.useCallback(async (apiKey, projectId, configId, websocketUrl) => {
        const config = createConnectionConfig(apiKey, projectId, configId, {
            websocketUrl,
            debug: options.debug
        });
        return voice.connect({
            auth: config,
            audioConfig: options.audioConfig
        });
    }, [voice, options.debug, options.audioConfig]);
    return {
        ...voice,
        connect: connectSimple
    };
}
/**
 * Hook for connection status and utilities
 */
function useVoiceStatus() {
    const { readyState, error, connectionMetadata } = useVoiceContext();
    return {
        /** Current connection state */
        readyState,
        /** Connection error if any */
        error,
        /** Connection metadata */
        connectionMetadata,
        /** Whether currently connected */
        isConnected: readyState === ConnectionState.Connected,
        /** Whether currently connecting */
        isConnecting: readyState === ConnectionState.Connecting,
        /** Whether disconnected */
        isDisconnected: readyState === ConnectionState.Disconnected,
        /** Whether in error state */
        hasError: readyState === ConnectionState.Error || !!error
    };
}
/**
 * Hook for conversation management
 */
function useVoiceMessages() {
    const { messages, clearMessages, sendMessage, isWaitingForResponse } = useVoiceContext();
    // Get messages by type
    const userMessages = messages.filter(msg => msg.type === 'user');
    const assistantMessages = messages.filter(msg => msg.type === 'assistant');
    const systemMessages = messages.filter(msg => msg.type === 'system');
    const errorMessages = messages.filter(msg => msg.type === 'error');
    // Get the most recent message
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    // Check if there are any streaming messages
    const hasStreamingMessages = messages.some(msg => msg.metadata?.isStreaming);
    return {
        /** All messages in chronological order */
        messages,
        /** User messages only */
        userMessages,
        /** Assistant messages only */
        assistantMessages,
        /** System messages only */
        systemMessages,
        /** Error messages only */
        errorMessages,
        /** Most recent message */
        lastMessage,
        /** Whether there are streaming messages */
        hasStreamingMessages,
        /** Whether waiting for AI response */
        isWaitingForResponse,
        /** Clear all messages */
        clearMessages,
        /** Send a text message (for testing) */
        sendMessage,
        /** Get message count */
        messageCount: messages.length,
        /** Get conversation length in characters */
        conversationLength: messages.reduce((total, msg) => total + msg.content.length, 0)
    };
}
/**
 * Hook for audio status and controls
 */
function useVoiceAudio() {
    const { isRecording, isTTSPlaying } = useVoiceContext();
    return {
        /** Whether currently recording audio */
        isRecording,
        /** Whether TTS audio is currently playing */
        isTTSPlaying,
        /** Whether any audio activity is happening */
        hasAudioActivity: isRecording || isTTSPlaying
    };
}
/**
 * Development helper hook for debugging
 */
function useVoiceDebug() {
    const context = useVoiceContext();
    const getDebugInfo = react.useCallback(() => {
        return {
            state: {
                readyState: context.readyState,
                messageCount: context.messages.length,
                isRecording: context.isRecording,
                isTTSPlaying: context.isTTSPlaying,
                isWaitingForResponse: context.isWaitingForResponse,
                error: context.error
            },
            connectionMetadata: context.connectionMetadata,
            recentMessages: context.messages.slice(-5), // Last 5 messages
            timestamp: new Date().toISOString()
        };
    }, [context]);
    const logDebugInfo = react.useCallback(() => {
        console.log('[NextEVI Debug]', getDebugInfo());
    }, [getDebugInfo]);
    return {
        getDebugInfo,
        logDebugInfo,
        context: process.env.NODE_ENV === 'development' ? context : undefined
    };
}

/**
 * NextEVI Voice React SDK
 *
 * A React SDK for integrating with the NextEVI Voice AI Platform.
 * Provides real-time voice conversations with speech-to-text,
 * LLM processing, and text-to-speech capabilities.
 *
 * @example
 * ```tsx
 * import { VoiceProvider, useVoice } from '@nextevi/voice-react';
 *
 * function App() {
 *   return (
 *     <VoiceProvider>
 *       <VoiceChat />
 *     </VoiceProvider>
 *   );
 * }
 *
 * function VoiceChat() {
 *   const { connect, disconnect, readyState, messages } = useVoice();
 *
 *   const handleConnect = async () => {
 *     await connect({
 *       auth: {
 *         apiKey: "oak_your_api_key_here",
 *         projectId: "your-project-id",
 *         configId: "your-config-id"
 *       }
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleConnect}>Connect</button>
 *       <div>Status: {readyState}</div>
 *       {messages.map(message => (
 *         <div key={message.id}>
 *           <strong>{message.type}:</strong> {message.content}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
// Main components
// Constants
const NEXTEVI_VERSION = '1.0.0';
const DEFAULT_CONFIG = {
    sampleRate: 24000,
    channels: 1,
    encoding: 'linear16',
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false
};
const CONNECTION_STATES = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ERROR: 'error'
};
/**
 * Quick start helper for simple integrations
 *
 * @example
 * ```tsx
 * import { quickStart } from '@nextevi/voice-react';
 *
 * const voice = quickStart({
 *   apiKey: "oak_your_api_key",
 *   projectId: "your-project",
 *   configId: "your-config"
 * });
 * ```
 */
function quickStart(config) {
    const connectionConfig = createConnectionConfig(config.apiKey, config.projectId, config.configId, { debug: config.debug });
    return {
        config: connectionConfig,
        connect: (audioConfig) => ({
            auth: connectionConfig,
            audioConfig
        })
    };
}
/**
 * Development utilities for debugging and testing
 */
const devUtils = {
    /**
     * Check if the current environment supports NextEVI SDK
     */
    checkEnvironment: () => {
        const browserInfo = getBrowserInfo();
        console.log('[NextEVI] Environment check:', browserInfo);
        return browserInfo;
    },
    /**
     * Test microphone access
     */
    testMicrophone: async () => {
        const hasAccess = await requestMicrophonePermission();
        console.log('[NextEVI] Microphone access:', hasAccess ? 'granted' : 'denied');
        return hasAccess;
    },
    /**
     * Validate configuration
     */
    validateConfiguration: (config) => {
        try {
            validateConfig(config);
            console.log('[NextEVI] Configuration is valid');
            return true;
        }
        catch (error) {
            console.error('[NextEVI] Configuration validation failed:', error);
            return false;
        }
    }
};

exports.CONNECTION_STATES = CONNECTION_STATES;
exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
exports.NEXTEVI_VERSION = NEXTEVI_VERSION;
exports.VoiceProvider = VoiceProvider;
exports.configFromEnvironment = configFromEnvironment;
exports.createConnectionConfig = createConnectionConfig;
exports.devUtils = devUtils;
exports.generateConnectionId = generateConnectionId;
exports.getBrowserInfo = getBrowserInfo;
exports.getDefaultWebSocketUrl = getDefaultWebSocketUrl;
exports.isAudioSupported = isAudioSupported;
exports.isDevelopment = isDevelopment;
exports.isEnvironmentSupported = isEnvironmentSupported;
exports.maskApiKey = maskApiKey;
exports.quickStart = quickStart;
exports.requestMicrophonePermission = requestMicrophonePermission;
exports.useSimpleVoice = useSimpleVoice;
exports.useVoice = useVoice;
exports.useVoiceAudio = useVoiceAudio;
exports.useVoiceDebug = useVoiceDebug;
exports.useVoiceMessages = useVoiceMessages;
exports.useVoiceStatus = useVoiceStatus;
exports.validateApiKey = validateApiKey;
exports.validateConfig = validateConfig;
exports.validateConfigId = validateConfigId;
exports.validateProjectId = validateProjectId;
//# sourceMappingURL=index.js.map
