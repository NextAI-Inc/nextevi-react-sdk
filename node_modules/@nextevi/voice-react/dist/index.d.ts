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
export { VoiceProvider } from './components/VoiceProvider';
export { useVoice, useSimpleVoice, useVoiceStatus, useVoiceMessages, useVoiceAudio, useVoiceIdleTimeout, useVoiceTurnDetection, useVoiceDebug } from './hooks/useVoice';
export type { NextEVIConfig, NextEVIConfigLegacy, APIKeyAuthConfig, JWTAuthConfig, VoiceConnectionConfig, AudioConfig, IdleTimeoutConfig, VoiceState, VoiceMessage, ConnectionState, UseVoiceHook, TranscriptionResult, TTSChunk, LLMResponseChunk, EmotionData, WordResult, TurnDetectionResult, InterruptionMessage, SystemMessage, TurnCompleteMessage, IdleWarningMessage, ConnectionMetadata, WebSocketMessage, SessionSettings, NextEVIError, ErrorCode, PCMData, AudioProcessor } from './types';
export { validateApiKey, validateJWTToken, validateProjectId, validateConfigId, validateConfig, createConnectionConfig, createJWTConnectionConfig, createUnifiedConnectionConfig, isJWTAuth, isAPIKeyAuth, configFromEnvironment, maskApiKey, generateConnectionId, isEnvironmentSupported, getBrowserInfo, getDefaultWebSocketUrl, isDevelopment, } from './utils/auth';
export declare const NEXTEVI_VERSION = "1.1.0";
export declare const DEFAULT_CONFIG: {
    sampleRate: number;
    channels: number;
    encoding: "linear16";
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
};
export declare const CONNECTION_STATES: {
    DISCONNECTED: "disconnected";
    CONNECTING: "connecting";
    CONNECTED: "connected";
    ERROR: "error";
};
/**
 * Quick start helper for API key authentication
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
export declare function quickStart(config: {
    apiKey: string;
    projectId: string;
    configId: string;
    debug?: boolean;
}): {
    config: import("./types").APIKeyAuthConfig;
    connect: (audioConfig?: any) => {
        auth: import("./types").APIKeyAuthConfig;
        audioConfig: any;
    };
};
/**
 * Quick start helper for JWT authentication
 *
 * @example
 * ```tsx
 * import { quickStartJWT } from '@nextevi/voice-react';
 *
 * const voice = quickStartJWT({
 *   accessToken: "your_jwt_token",
 *   configId: "your-config"
 * });
 * ```
 */
export declare function quickStartJWT(config: {
    accessToken: string;
    configId: string;
    projectId?: string;
    debug?: boolean;
}): {
    config: import("./types").JWTAuthConfig;
    connect: (audioConfig?: any) => {
        auth: import("./types").JWTAuthConfig;
        audioConfig: any;
    };
};
/**
 * Unified quick start helper that detects authentication type
 *
 * @example
 * ```tsx
 * import { quickStartUnified } from '@nextevi/voice-react';
 *
 * // API Key auth
 * const voice1 = quickStartUnified({
 *   apiKey: "oak_your_api_key",
 *   projectId: "your-project",
 *   configId: "your-config"
 * });
 *
 * // JWT auth
 * const voice2 = quickStartUnified({
 *   accessToken: "your_jwt_token",
 *   configId: "your-config"
 * });
 * ```
 */
export declare function quickStartUnified(config: {
    apiKey?: string;
    projectId?: string;
    accessToken?: string;
    configId: string;
    debug?: boolean;
}): {
    config: import("./types").NextEVIConfig;
    connect: (audioConfig?: any) => {
        auth: import("./types").NextEVIConfig;
        audioConfig: any;
    };
};
/**
 * Development utilities for debugging and testing
 */
export declare const devUtils: {
    /**
     * Check if the current environment supports NextEVI SDK
     */
    checkEnvironment: () => {
        isSupported: boolean;
        missingFeatures: string[];
        userAgent: string;
    };
    /**
     * Test microphone access
     */
    testMicrophone: () => Promise<boolean>;
    /**
     * Validate configuration
     */
    validateConfiguration: (config: any) => boolean;
};
import { isAudioSupported, requestMicrophonePermission } from './utils/audio';
export { isAudioSupported, requestMicrophonePermission };
//# sourceMappingURL=index.d.ts.map