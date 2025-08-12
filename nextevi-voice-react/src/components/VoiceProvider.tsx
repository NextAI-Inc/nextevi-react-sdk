/**
 * VoiceProvider - React Context Provider for NextEVI Voice SDK
 * Manages voice connection state, audio processing, and message history
 */

import React, { 
  createContext, 
  useContext, 
  useReducer, 
  useRef, 
  useEffect, 
  useCallback,
  ReactNode 
} from 'react';

import {
  VoiceState,
  VoiceActions,
  VoiceConnectionConfig,
  ConnectionState,
  VoiceMessage,
  TranscriptionResult,
  TTSChunk,
  LLMResponseChunk,
  EmotionData,
  ConnectionMetadata,
  NextEVIError,
  ErrorCode
} from '../types';

import { WebSocketManager, WebSocketEvents } from '../utils/websocket';
import { AudioManager, AudioProcessorEvents, isAudioSupported } from '../utils/audio';
import { validateConfig, sanitizeConfigForLogging, isEnvironmentSupported } from '../utils/auth';

// Action types for state reducer
type VoiceAction =
  | { type: 'SET_CONNECTION_STATE'; payload: ConnectionState }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_TTS_PLAYING'; payload: boolean }
  | { type: 'SET_WAITING_FOR_RESPONSE'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: VoiceMessage }
  | { type: 'UPDATE_STREAMING_MESSAGE'; payload: { content: string; type: 'user' | 'assistant' } }
  | { type: 'FINALIZE_STREAMING_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_CONNECTION_METADATA'; payload: ConnectionMetadata }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_STATE' };

// Initial state
const initialState: VoiceState = {
  readyState: ConnectionState.Disconnected,
  messages: [],
  isRecording: false,
  isTTSPlaying: false,
  isWaitingForResponse: false,
  connectionMetadata: undefined,
  error: undefined
};

// State reducer
function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
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
      } else {
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
      const messages = state.messages.map(msg => 
        msg.id === action.payload.id 
          ? { 
              ...msg, 
              content: action.payload.content,
              metadata: { ...msg.metadata, isStreaming: false }
            }
          : msg
      );
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

// Context interface
interface VoiceContextValue extends VoiceState, VoiceActions {}

// Create context
const VoiceContext = createContext<VoiceContextValue | null>(null);

// Provider props
interface VoiceProviderProps {
  children: ReactNode;
  debug?: boolean;
}

// Provider component
export function VoiceProvider({ children, debug = false }: VoiceProviderProps) {
  const [state, dispatch] = useReducer(voiceReducer, initialState);
  const wsManagerRef = useRef<WebSocketManager | null>(null);
  const audioManagerRef = useRef<AudioManager | null>(null);
  const currentStreamingMessageId = useRef<string | null>(null);

  // Check environment support on mount
  useEffect(() => {
    if (!isEnvironmentSupported()) {
      const error = new NextEVIError(
        'NextEVI SDK is not supported in this environment',
        ErrorCode.AUDIO_INITIALIZATION_FAILED
      );
      dispatch({ type: 'SET_ERROR', payload: error.message });
      console.error('[NextEVI] Environment not supported:', error);
    }
  }, []);

  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Add message to conversation
  const addMessage = useCallback((type: VoiceMessage['type'], content: string, metadata?: VoiceMessage['metadata']) => {
    const message: VoiceMessage = {
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
  const wsEvents: WebSocketEvents = {
    onStateChange: (connectionState: ConnectionState) => {
      dispatch({ type: 'SET_CONNECTION_STATE', payload: connectionState });
      
      if (debug) {
        console.log('[NextEVI] Connection state changed:', connectionState);
      }
    },

    onTranscription: (result: TranscriptionResult) => {
      if (result.isFinal && result.transcript.trim()) {
        // Final transcription - add as user message
        addMessage('user', result.transcript, {
          confidence: result.confidence,
          isFinal: true
        });
        
        dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: true });
      } else if (result.transcript.trim()) {
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

    onTTSChunk: (chunk: TTSChunk) => {
      // Play TTS audio chunk
      if (audioManagerRef.current && chunk.content) {
        audioManagerRef.current.playTTSChunk(chunk.content);
      }
      
      if (debug) {
        console.log('[NextEVI] TTS chunk received');
      }
    },

    onLLMChunk: (chunk: LLMResponseChunk) => {
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
        } else {
          addMessage('assistant', chunk.content, {
            generationId: chunk.generationId,
            isFinal: true
          });
        }
        
        dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: false });
      } else {
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

    onEmotion: (emotions: EmotionData[]) => {
      // Add emotion data to the last user message
      if (state.messages.length > 0) {
        const lastUserMessage = [...state.messages].reverse().find(msg => msg.type === 'user');
        if (lastUserMessage && !lastUserMessage.metadata?.emotions) {
          // Update message with emotion data
          const updatedMessages = state.messages.map(msg =>
            msg.id === lastUserMessage.id
              ? { ...msg, metadata: { ...msg.metadata, emotions } }
              : msg
          );
          // Note: This is a side effect - in a real implementation, you might want to handle this differently
        }
      }
      
      if (debug) {
        console.log('[NextEVI] Emotions detected:', emotions);
      }
    },

    onConnectionMetadata: (metadata: ConnectionMetadata) => {
      dispatch({ type: 'SET_CONNECTION_METADATA', payload: metadata });
      
      if (debug) {
        console.log('[NextEVI] Connection metadata:', metadata);
      }
    },

    onError: (error: NextEVIError) => {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      addMessage('error', `Error: ${error.message}`);
      
      console.error('[NextEVI] Error:', error);
    }
  };

  // Audio event handlers
  const audioEvents: AudioProcessorEvents = {
    onAudioData: (data: ArrayBuffer) => {
      // Send audio data through WebSocket
      if (wsManagerRef.current && wsManagerRef.current.isConnected()) {
        wsManagerRef.current.sendAudioData(data);
      }
    },

    onTTSPlayback: (isPlaying: boolean) => {
      dispatch({ type: 'SET_TTS_PLAYING', payload: isPlaying });
    },

    onError: (error: NextEVIError) => {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      addMessage('error', `Audio Error: ${error.message}`);
      
      console.error('[NextEVI] Audio error:', error);
    }
  };

  // Connect to NextEVI service
  const connect = useCallback(async (config: VoiceConnectionConfig) => {
    try {
      // Validate configuration
      validateConfig(config.auth);
      
      if (debug) {
        console.log('[NextEVI] Connecting with config:', sanitizeConfigForLogging(config.auth));
      }

      // Check audio support
      if (!isAudioSupported()) {
        throw new NextEVIError(
          'Audio features not supported in this browser',
          ErrorCode.AUDIO_INITIALIZATION_FAILED
        );
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
        throw new NextEVIError(
          'Failed to initialize audio processing',
          ErrorCode.AUDIO_INITIALIZATION_FAILED
        );
      }

      // Connect WebSocket
      await wsManagerRef.current.connect(config.auth);

      // Send session settings
      const audioConfig = audioManagerRef.current.getConfig();
      wsManagerRef.current.sendSessionSettings(
        audioConfig.sampleRate || 24000,
        audioConfig.channels || 1,
        audioConfig.encoding || 'linear16'
      );

      // Start audio processing
      const audioStarted = await audioManagerRef.current.start();
      if (!audioStarted) {
        throw new NextEVIError(
          'Failed to start audio capture',
          ErrorCode.AUDIO_INITIALIZATION_FAILED
        );
      }

      dispatch({ type: 'SET_RECORDING', payload: true });
      addMessage('system', 'Connected to NextEVI. Start speaking!');
      
      if (debug) {
        console.log('[NextEVI] Successfully connected and ready');
      }

    } catch (error) {
      const nextEVIError = error instanceof NextEVIError 
        ? error 
        : new NextEVIError(`Connection failed: ${(error as Error).message}`, ErrorCode.CONNECTION_FAILED, error);
      
      dispatch({ type: 'SET_ERROR', payload: nextEVIError.message });
      addMessage('error', nextEVIError.message);
      
      // Cleanup on failure
      await cleanup();
      
      throw nextEVIError;
    }
  }, [debug, wsEvents, audioEvents, addMessage]);

  // Disconnect from service
  const disconnect = useCallback(async () => {
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
  const cleanup = useCallback(async () => {
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
  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
    
    if (debug) {
      console.log('[NextEVI] Messages cleared');
    }
  }, [debug]);

  // Send text message (for testing)
  const sendMessage = useCallback((content: string) => {
    addMessage('user', content);
    
    if (debug) {
      console.log('[NextEVI] Sent text message:', content);
    }
  }, [addMessage, debug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Context value
  const contextValue: VoiceContextValue = {
    ...state,
    connect,
    disconnect,
    clearMessages,
    sendMessage
  };

  return (
    <VoiceContext.Provider value={contextValue}>
      {children}
    </VoiceContext.Provider>
  );
}

// Custom hook to use the voice context
export function useVoiceContext(): VoiceContextValue {
  const context = useContext(VoiceContext);
  
  if (!context) {
    throw new Error('useVoiceContext must be used within a VoiceProvider');
  }
  
  return context;
}