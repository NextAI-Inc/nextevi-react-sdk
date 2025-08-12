/**
 * useVoice Hook - Main API for NextEVI Voice SDK
 * Provides a Hume-style interface for voice interactions
 */

import { useCallback } from 'react';
import { useVoiceContext } from '../components/VoiceProvider';
import { 
  UseVoiceHook, 
  VoiceConnectionConfig, 
  NextEVIConfig,
  AudioConfig,
  ConnectionState
} from '../types';
import { createConnectionConfig } from '../utils/auth';

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
export function useVoice(options: UseVoiceOptions = {}): UseVoiceHook {
  const context = useVoiceContext();
  
  const {
    debug = false,
    audioConfig,
    autoClearMessages = false
  } = options;

  // Enhanced connect method with additional options
  const connect = useCallback(async (config: VoiceConnectionConfig) => {
    // Clear messages if auto-clear is enabled
    if (autoClearMessages && context.messages.length > 0) {
      context.clearMessages();
    }

    // Merge audio config from options
    const enhancedConfig: VoiceConnectionConfig = {
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
export function useSimpleVoice(options: UseVoiceOptions = {}) {
  const voice = useVoice(options);

  const connectSimple = useCallback(async (
    apiKey: string,
    projectId: string,
    configId: string,
    websocketUrl?: string
  ) => {
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
export function useVoiceStatus() {
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
export function useVoiceMessages() {
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
export function useVoiceAudio() {
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
export function useVoiceDebug(): {
  getDebugInfo: () => any;
  logDebugInfo: () => void;
  context: any;
} {
  const context = useVoiceContext();

  const getDebugInfo = useCallback(() => {
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

  const logDebugInfo = useCallback(() => {
    console.log('[NextEVI Debug]', getDebugInfo());
  }, [getDebugInfo]);

  return {
    getDebugInfo,
    logDebugInfo,
    context: process.env.NODE_ENV === 'development' ? context : undefined
  };
}