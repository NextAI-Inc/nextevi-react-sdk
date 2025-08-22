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
  ErrorCode,
  InterruptionMessage,
  SystemMessage,
  TurnCompleteMessage,
  IdleWarningMessage
} from '../types';

import { WebSocketManager, WebSocketEvents } from '../utils/websocket';
import { AudioManager, AudioProcessorEvents, isAudioSupported } from '../utils/audio';
import { validateConfig, sanitizeConfigForLogging, isEnvironmentSupported } from '../utils/auth';
import { checkAPISupport } from '../utils/browser-apis';

// Action types for state reducer
type VoiceAction =
  | { type: 'SET_CONNECTION_STATE'; payload: ConnectionState }
  | { type: 'SET_RECORDING'; payload: boolean }
  | { type: 'SET_TTS_PLAYING'; payload: boolean }
  | { type: 'SET_WAITING_FOR_RESPONSE'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: VoiceMessage }
  | { type: 'UPDATE_STREAMING_MESSAGE'; payload: { content: string; type: 'user' | 'assistant' } }
  | { type: 'FINALIZE_STREAMING_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'UPDATE_MESSAGE_METADATA'; payload: { id: string; metadata: VoiceMessage['metadata'] } }
  | { type: 'ADD_EMOTIONS_TO_LATEST_USER_MESSAGE'; payload: { emotions: EmotionData[] } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_CONNECTION_METADATA'; payload: ConnectionMetadata }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_IDLE_WARNING'; payload: { active: boolean; timeRemaining?: number; type?: string } }
  | { type: 'RESET_STATE' };

// Initial state
const initialState: VoiceState = {
  readyState: ConnectionState.Disconnected,
  messages: [],
  isRecording: false,
  isTTSPlaying: false,
  isWaitingForResponse: false,
  connectionMetadata: undefined,
  error: undefined,
  idleWarning: undefined
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
    
    case 'UPDATE_MESSAGE_METADATA': {
      const messages = state.messages.map(msg => 
        msg.id === action.payload.id 
          ? { 
              ...msg, 
              metadata: { ...msg.metadata, ...action.payload.metadata }
            }
          : msg
      );
      return { ...state, messages };
    }
    
    case 'ADD_EMOTIONS_TO_LATEST_USER_MESSAGE': {
      const messages = [...state.messages];
      // Find the most recent user message without emotions
      const lastUserMessageIndex = messages.map((msg, idx) => ({ msg, idx }))
        .reverse()
        .find(({ msg }) => msg.type === 'user' && !msg.metadata?.emotions)?.idx;
      
      if (lastUserMessageIndex !== undefined) {
        messages[lastUserMessageIndex] = {
          ...messages[lastUserMessageIndex],
          metadata: {
            ...messages[lastUserMessageIndex].metadata,
            emotions: action.payload.emotions
          }
        };
        console.log('[NextEVI] 🎭 Reducer: Added emotions to message at index', lastUserMessageIndex, action.payload.emotions);
      } else {
        console.log('[NextEVI] ⚠️ Reducer: No user message without emotions found to update');
      }
      
      return { ...state, messages };
    }
      
    case 'CLEAR_MESSAGES':
      return { ...state, messages: [] };
      
    case 'SET_CONNECTION_METADATA':
      return { ...state, connectionMetadata: action.payload };
      
    case 'SET_ERROR':
      return { ...state, error: action.payload };
      
    case 'SET_IDLE_WARNING':
      return { 
        ...state, 
        idleWarning: action.payload.active ? {
          active: true,
          timeRemaining: action.payload.timeRemaining,
          type: action.payload.type as 'warning' | 'final_warning'
        } : undefined
      };
      
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
      
      // Clear idle warning when connection state changes
      dispatch({
        type: 'SET_IDLE_WARNING',
        payload: { active: false }
      });
      
      if (debug) {
        console.log('[NextEVI] Connection state changed:', connectionState);
      }
    },

    onTranscription: (result: TranscriptionResult) => {
      // Clear idle warning on user activity
      if (result.transcript.trim()) {
        dispatch({
          type: 'SET_IDLE_WARNING',
          payload: { active: false }
        });
      }
      
      if (result.isFinal && result.transcript.trim()) {
        // Final transcription - add as user message
        addMessage('user', result.transcript, {
          confidence: result.confidence,
          isFinal: true,
          isUtteranceEnd: result.isUtteranceEnd,
          turnComplete: result.turnComplete,
          words: result.words
        });
        
        dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: true });
      } else if (result.transcript.trim()) {
        // Interim transcription - update streaming message
        dispatch({ 
          type: 'UPDATE_STREAMING_MESSAGE', 
          payload: { content: result.transcript, type: 'user' }
        });
      }
      
      // Handle utterance end events specifically
      if (result.isUtteranceEnd && debug) {
        console.log('[NextEVI] Utterance end detected');
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
      if (debug) {
        console.log('[NextEVI] 🎭 VoiceProvider onEmotion handler called with:', emotions);
      }
      
      // Use a dispatch action to find and update the message with emotions
      // This avoids stale closure issues by letting the reducer handle the logic
      dispatch({
        type: 'ADD_EMOTIONS_TO_LATEST_USER_MESSAGE',
        payload: { emotions }
      });
      
      if (debug) {
        console.log('[NextEVI] 🎭 Dispatched ADD_EMOTIONS_TO_LATEST_USER_MESSAGE with', emotions.length, 'emotions');
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
    },

    onInterruption: (interruption: InterruptionMessage) => {
      // Handle TTS interruption
      dispatch({ type: 'SET_TTS_PLAYING', payload: false });
      
      if (debug) {
        console.log('[NextEVI] TTS interrupted');
      }
    },

    onSystemMessage: (message: SystemMessage) => {
      // Add system message to conversation
      addMessage('system', message.content, {
        messageType: message.messageType
      });
      
      if (debug) {
        console.log('[NextEVI] System message:', message.messageType, message.content);
      }
    },

    onTurnComplete: (turnMessage: TurnCompleteMessage) => {
      // Find the most recent user message and update it with turn completion data
      if (turnMessage.transcript && state.messages.length > 0) {
        const lastUserMessage = [...state.messages].reverse().find(msg => msg.type === 'user');
        if (lastUserMessage && lastUserMessage.content === turnMessage.transcript.trim()) {
          // Update the message to include turn completion information
          addMessage('user', lastUserMessage.content, {
            ...lastUserMessage.metadata,
            turnComplete: true,
            turnResult: turnMessage.turnResult
          });
        }
      }
      
      if (debug) {
        console.log('[NextEVI] Turn complete:', turnMessage.turnResult);
        console.log('[NextEVI] Turn completion reasons:', turnMessage.turnResult.reasons);
      }
    },

    onIdleWarning: (warning: IdleWarningMessage) => {
      // Update idle warning state
      dispatch({
        type: 'SET_IDLE_WARNING',
        payload: {
          active: true,
          timeRemaining: warning.timeRemaining,
          type: warning.warningType
        }
      });
      
      // Add warning message to conversation
      const warningText = warning.warningType === 'final_warning' 
        ? `Final warning: Connection will end in ${warning.timeRemaining} seconds`
        : `Idle warning: ${warning.timeRemaining} seconds remaining`;
        
      addMessage('warning', warningText, {
        messageType: warning.warningType === 'final_warning' ? 'hangup' : 'warning'
      });
      
      if (debug) {
        console.log('[NextEVI] Idle warning:', warning.warningType, warning.timeRemaining);
      }
    }
  };

  // Audio event handlers
  const audioEvents: AudioProcessorEvents = {
    onAudioData: (data: ArrayBuffer) => {
      // Validate and send audio data through WebSocket
      if (!data || data.byteLength === 0) {
        if (debug) {
          console.warn('[NextEVI] ⚠️ Received empty audio data');
        }
        return;
      }
      
      if (wsManagerRef.current && wsManagerRef.current.isConnected()) {
        if (debug) {
          console.log(`[NextEVI] 🎤 Received audio data from worklet: ${data.byteLength} bytes`);
          
          // Sample the audio data to check for silence
          const samples = new Int16Array(data);
          const maxSample = Math.max(...Array.from(samples).map(Math.abs));
          if (maxSample === 0) {
            console.log('[NextEVI] 🔇 Audio data is silent');
          } else {
            console.log(`[NextEVI] 🔊 Audio data has activity, max amplitude: ${maxSample}`);
          }
        }
        
        wsManagerRef.current.sendAudioData(data);
      } else {
        if (debug) {
          console.warn('[NextEVI] ⚠️ Received audio data but WebSocket not connected');
        }
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

      // Initialize audio processing with enhanced logging
      if (debug) {
        console.log('[NextEVI] Initializing audio processing...');
      }
      
      const audioInitialized = await audioManagerRef.current.initialize();
      if (!audioInitialized) {
        console.error('[NextEVI] ❌ Audio initialization failed');
        throw new NextEVIError(
          'Failed to initialize audio processing',
          ErrorCode.AUDIO_INITIALIZATION_FAILED
        );
      }
      
      if (debug) {
        console.log('[NextEVI] ✅ Audio processing initialized successfully');
      }

      // Connect WebSocket
      await wsManagerRef.current.connect(config.auth);

      // Send session settings with idle timeout configuration
      const audioConfig = audioManagerRef.current.getConfig();
      const sessionSettings = {
        sampleRate: audioConfig.sampleRate || 24000,
        channels: audioConfig.channels || 1,
        encoding: audioConfig.encoding || 'linear16',
        // Add idle timeout settings if provided
        ...(config.idleTimeout && {
          idleTimeout: config.idleTimeout
        })
      };
      
      if (debug) {
        console.log('[NextEVI] Sending session settings:', sessionSettings);
      }
      
      wsManagerRef.current.sendSessionSettings(sessionSettings);
      
      // Wait a moment for session settings to be processed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start audio processing with enhanced logging
      if (debug) {
        console.log('[NextEVI] Starting audio capture...');
      }
      
      const audioStarted = await audioManagerRef.current.start();
      if (!audioStarted) {
        console.error('[NextEVI] ❌ Audio capture start failed');
        throw new NextEVIError(
          'Failed to start audio capture',
          ErrorCode.AUDIO_INITIALIZATION_FAILED
        );
      }
      
      if (debug) {
        console.log('[NextEVI] ✅ Audio capture started successfully');
      }

      dispatch({ type: 'SET_RECORDING', payload: true });
      addMessage('system', 'Connected to NextEVI. Start speaking!');
      
      // Add a test to verify audio pipeline
      if (debug) {
        console.log('[NextEVI] 🎤 Audio pipeline ready. Speak into your microphone to test.');
        console.log('[NextEVI] Expected audio format: PCM16, ' + sessionSettings.sampleRate + 'Hz, ' + sessionSettings.channels + ' channel(s)');
      }
      
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