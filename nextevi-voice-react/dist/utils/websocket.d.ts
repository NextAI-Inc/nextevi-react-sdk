/**
 * WebSocket Connection Manager for NextEVI Voice SDK
 * Handles WebSocket connections, message routing, and connection state
 */
import { NextEVIConfig, ConnectionState, WebSocketMessage, TranscriptionResult, TTSChunk, LLMResponseChunk, EmotionData, ConnectionMetadata, NextEVIError } from '../types';
export interface WebSocketEvents {
    onStateChange: (state: ConnectionState) => void;
    onTranscription: (result: TranscriptionResult) => void;
    onTTSChunk: (chunk: TTSChunk) => void;
    onLLMChunk: (chunk: LLMResponseChunk) => void;
    onEmotion: (emotions: EmotionData[]) => void;
    onConnectionMetadata: (metadata: ConnectionMetadata) => void;
    onError: (error: NextEVIError) => void;
}
export declare class WebSocketManager {
    private websocket;
    private config;
    private connectionState;
    private connectionId;
    private events;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    constructor();
    /**
     * Set event handlers for WebSocket events
     */
    setEvents(events: Partial<WebSocketEvents>): void;
    /**
     * Connect to NextEVI voice service
     */
    connect(config: NextEVIConfig): Promise<void>;
    /**
     * Disconnect from service
     */
    disconnect(): Promise<void>;
    /**
     * Send session settings to configure audio parameters
     */
    sendSessionSettings(sampleRate: number, channels: number, encoding: string): void;
    /**
     * Send binary audio data
     */
    sendAudioData(audioData: ArrayBuffer): void;
    /**
     * Send JSON message
     */
    sendMessage(message: WebSocketMessage): void;
    /**
     * Get current connection state
     */
    getConnectionState(): ConnectionState;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Get connection ID
     */
    getConnectionId(): string | null;
    private buildWebSocketUrl;
    private getDefaultWebSocketUrl;
    private setConnectionState;
    private handleOpen;
    private handleMessage;
    private handleClose;
    private handleError;
    private routeMessage;
    private handleTranscriptionMessage;
    private handleTTSChunkMessage;
    private handleLLMChunkMessage;
    private handleEmotionMessage;
    private handleConnectionMetadata;
    private handleErrorMessage;
    private attemptReconnection;
}
//# sourceMappingURL=websocket.d.ts.map