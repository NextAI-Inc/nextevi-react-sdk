/**
 * NextEVI Voice React SDK - Type Definitions
 * Based on NextEVI backend API and inspired by Hume EVI patterns
 */
export interface NextEVIConfig {
    /** NextEVI API key (starts with oak_) */
    apiKey: string;
    /** Project identifier */
    projectId: string;
    /** Configuration identifier */
    configId: string;
    /** WebSocket URL (optional, defaults to production endpoint) */
    websocketUrl?: string;
    /** Enable debug logging */
    debug?: boolean;
}
export interface VoiceConnectionConfig {
    auth: NextEVIConfig;
    /** Audio configuration overrides */
    audioConfig?: AudioConfig;
}
export interface AudioConfig {
    /** Sample rate in Hz (default: 24000) */
    sampleRate?: number;
    /** Number of channels (default: 1) */
    channels?: number;
    /** Audio encoding (default: 'linear16') */
    encoding?: 'linear16' | 'pcm';
    /** Enable echo cancellation (default: true) */
    echoCancellation?: boolean;
    /** Enable noise suppression (default: true) */
    noiseSuppression?: boolean;
    /** Enable auto gain control (default: false) */
    autoGainControl?: boolean;
}
export declare enum ConnectionState {
    Disconnected = "disconnected",
    Connecting = "connecting",
    Connected = "connected",
    Error = "error"
}
export interface VoiceMessage {
    /** Unique message ID */
    id: string;
    /** Message type */
    type: 'user' | 'assistant' | 'system' | 'error';
    /** Message content */
    content: string;
    /** Timestamp when message was created */
    timestamp: Date;
    /** Additional metadata */
    metadata?: {
        confidence?: number;
        emotions?: EmotionData[];
        isFinal?: boolean;
        generationId?: string;
        isStreaming?: boolean;
    };
}
export interface EmotionData {
    emotion: string;
    percentage: number;
}
export interface TranscriptionResult {
    transcript: string;
    confidence: number;
    isFinal: boolean;
    isInterim: boolean;
    words?: WordResult[];
}
export interface WordResult {
    word: string;
    start: number;
    end: number;
    confidence: number;
}
export interface TTSChunk {
    content: string;
    chunkId?: string;
    isLast?: boolean;
}
export interface LLMResponseChunk {
    content: string;
    isFinal: boolean;
    generationId?: string;
    chunkIndex?: number;
}
export interface WebSocketMessage {
    type: string;
    [key: string]: any;
}
export interface SessionSettings {
    sampleRate: number;
    channels: number;
    encoding: string;
}
export interface ConnectionMetadata {
    connectionId: string;
    status: string;
    config: AudioConfig;
    projectId: string;
    configId: string;
}
export interface VoiceState {
    /** Current connection state */
    readyState: ConnectionState;
    /** Array of conversation messages */
    messages: VoiceMessage[];
    /** Whether currently recording audio */
    isRecording: boolean;
    /** Whether TTS is currently playing */
    isTTSPlaying: boolean;
    /** Whether waiting for AI response */
    isWaitingForResponse: boolean;
    /** Connection metadata */
    connectionMetadata?: ConnectionMetadata;
    /** Current error if any */
    error?: string | null;
}
export interface VoiceActions {
    /** Connect to NextEVI voice service */
    connect(config: VoiceConnectionConfig): Promise<void>;
    /** Disconnect from service */
    disconnect(): Promise<void>;
    /** Clear conversation history */
    clearMessages(): void;
    /** Send a text message (for testing) */
    sendMessage(content: string): void;
}
export interface UseVoiceHook extends VoiceState, VoiceActions {
}
export interface AudioProcessor {
    initialize(): Promise<boolean>;
    start(): Promise<boolean>;
    stop(): Promise<void>;
    cleanup(): Promise<void>;
    isActive(): boolean;
}
export interface PCMData {
    data: Int16Array;
    sampleRate: number;
    channels: number;
}
export declare class NextEVIError extends Error {
    code: string;
    details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
export declare enum ErrorCode {
    CONNECTION_FAILED = "CONNECTION_FAILED",
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
    AUDIO_INITIALIZATION_FAILED = "AUDIO_INITIALIZATION_FAILED",
    MICROPHONE_ACCESS_DENIED = "MICROPHONE_ACCESS_DENIED",
    WEBSOCKET_ERROR = "WEBSOCKET_ERROR",
    INVALID_CONFIG = "INVALID_CONFIG"
}
//# sourceMappingURL=index.d.ts.map