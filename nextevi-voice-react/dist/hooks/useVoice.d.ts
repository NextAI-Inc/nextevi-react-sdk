/**
 * useVoice Hook - Main API for NextEVI Voice SDK
 * Provides a Hume-style interface for voice interactions
 */
import { UseVoiceHook, AudioConfig, ConnectionState } from '../types';
export interface UseVoiceOptions {
    /** Enable debug logging */
    debug?: boolean;
    /** Default audio configuration */
    audioConfig?: AudioConfig;
    /** Auto-clear messages on new connection */
    autoClearMessages?: boolean;
}
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
export declare function useVoice(options?: UseVoiceOptions): UseVoiceHook;
/**
 * Simplified connection helper that creates a config from individual parameters
 */
export declare function useSimpleVoice(options?: UseVoiceOptions): {
    connect: (apiKey: string, projectId: string, configId: string, websocketUrl?: string) => Promise<void>;
    readyState: ConnectionState;
    messages: import("../types").VoiceMessage[];
    isRecording: boolean;
    isTTSPlaying: boolean;
    isWaitingForResponse: boolean;
    connectionMetadata?: import("../types").ConnectionMetadata;
    error?: string | null;
    disconnect(): Promise<void>;
    clearMessages(): void;
    sendMessage(content: string): void;
};
/**
 * Hook for connection status and utilities
 */
export declare function useVoiceStatus(): {
    /** Current connection state */
    readyState: ConnectionState;
    /** Connection error if any */
    error: string | null | undefined;
    /** Connection metadata */
    connectionMetadata: import("../types").ConnectionMetadata | undefined;
    /** Whether currently connected */
    isConnected: boolean;
    /** Whether currently connecting */
    isConnecting: boolean;
    /** Whether disconnected */
    isDisconnected: boolean;
    /** Whether in error state */
    hasError: boolean;
};
/**
 * Hook for conversation management
 */
export declare function useVoiceMessages(): {
    /** All messages in chronological order */
    messages: import("../types").VoiceMessage[];
    /** User messages only */
    userMessages: import("../types").VoiceMessage[];
    /** Assistant messages only */
    assistantMessages: import("../types").VoiceMessage[];
    /** System messages only */
    systemMessages: import("../types").VoiceMessage[];
    /** Error messages only */
    errorMessages: import("../types").VoiceMessage[];
    /** Most recent message */
    lastMessage: import("../types").VoiceMessage | null;
    /** Whether there are streaming messages */
    hasStreamingMessages: boolean;
    /** Whether waiting for AI response */
    isWaitingForResponse: boolean;
    /** Clear all messages */
    clearMessages: () => void;
    /** Send a text message (for testing) */
    sendMessage: (content: string) => void;
    /** Get message count */
    messageCount: number;
    /** Get conversation length in characters */
    conversationLength: number;
};
/**
 * Hook for audio status and controls
 */
export declare function useVoiceAudio(): {
    /** Whether currently recording audio */
    isRecording: boolean;
    /** Whether TTS audio is currently playing */
    isTTSPlaying: boolean;
    /** Whether any audio activity is happening */
    hasAudioActivity: boolean;
};
/**
 * Development helper hook for debugging
 */
export declare function useVoiceDebug(): {
    getDebugInfo: () => any;
    logDebugInfo: () => void;
    context: any;
};
//# sourceMappingURL=useVoice.d.ts.map