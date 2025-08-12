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
export { VoiceProvider } from './components/VoiceProvider';

// Hooks
export { 
  useVoice, 
  useSimpleVoice, 
  useVoiceStatus, 
  useVoiceMessages, 
  useVoiceAudio,
  useVoiceDebug
} from './hooks/useVoice';

// Types
export type {
  // Core configuration types
  NextEVIConfig,
  VoiceConnectionConfig,
  AudioConfig,
  
  // State and message types
  VoiceState,
  VoiceMessage,
  ConnectionState,
  UseVoiceHook,
  
  // Audio processing types
  TranscriptionResult,
  TTSChunk,
  LLMResponseChunk,
  EmotionData,
  WordResult,
  
  // Connection types
  ConnectionMetadata,
  WebSocketMessage,
  SessionSettings,
  
  // Utility types
  NextEVIError,
  ErrorCode,
  PCMData,
  AudioProcessor
} from './types';

// Utilities
export {
  // Authentication utilities
  validateApiKey,
  validateProjectId,
  validateConfigId,
  validateConfig,
  createConnectionConfig,
  configFromEnvironment,
  maskApiKey,
  generateConnectionId,
  isEnvironmentSupported,
  getBrowserInfo,
  getDefaultWebSocketUrl,
  isDevelopment,
  
} from './utils/auth';


// Constants
export const NEXTEVI_VERSION = '1.0.0';

export const DEFAULT_CONFIG = {
  sampleRate: 24000,
  channels: 1,
  encoding: 'linear16' as const,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false
};

export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected' as const,
  CONNECTING: 'connecting' as const,
  CONNECTED: 'connected' as const,
  ERROR: 'error' as const
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
export function quickStart(config: {
  apiKey: string;
  projectId: string;
  configId: string;
  debug?: boolean;
}) {
  const connectionConfig = createConnectionConfig(
    config.apiKey,
    config.projectId,
    config.configId,
    { debug: config.debug }
  );

  return {
    config: connectionConfig,
    connect: (audioConfig?: any) => ({
      auth: connectionConfig,
      audioConfig
    })
  };
}

/**
 * Development utilities for debugging and testing
 */
export const devUtils = {
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
  validateConfiguration: (config: any) => {
    try {
      validateConfig(config);
      console.log('[NextEVI] Configuration is valid');
      return true;
    } catch (error) {
      console.error('[NextEVI] Configuration validation failed:', error);
      return false;
    }
  }
};

// Re-export utilities for convenience
import { 
  validateApiKey,
  validateProjectId, 
  validateConfigId,
  validateConfig,
  createConnectionConfig,
  configFromEnvironment,
  maskApiKey,
  generateConnectionId,
  isEnvironmentSupported,
  getBrowserInfo,
  getDefaultWebSocketUrl,
  isDevelopment
} from './utils/auth';

import { isAudioSupported, requestMicrophonePermission } from './utils/audio';

// Export audio utilities correctly
export { isAudioSupported, requestMicrophonePermission };