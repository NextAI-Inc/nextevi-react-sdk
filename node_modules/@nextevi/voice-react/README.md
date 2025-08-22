# NextEVI Voice React SDK

A React SDK for integrating with the NextEVI Voice AI Platform. Provides real-time voice conversations with speech-to-text, LLM processing, and text-to-speech capabilities.

## Features

- **Real-time Voice Conversations**: Full-duplex voice communication with AI
- **WebSocket-based**: Low-latency real-time communication
- **React Integration**: Easy-to-use hooks and providers
- **TypeScript Support**: Fully typed for better development experience
- **Audio Processing**: Built-in microphone capture and TTS playback
- **Emotion Recognition**: Real-time emotion detection from speech
- **Interruption Handling**: Natural conversation flow with TTS interruption

## Installation

```bash
npm install @nextevi/voice-react
```

## Quick Start

```tsx
import React from 'react';
import { VoiceProvider, useVoice } from '@nextevi/voice-react';

function App() {
  return (
    <VoiceProvider debug={true}>
      <VoiceChat />
    </VoiceProvider>
  );
}

function VoiceChat() {
  const { connect, disconnect, readyState, messages } = useVoice();
  
  const handleConnect = async () => {
    try {
      await connect({
        auth: {
          apiKey: "oak_your_api_key_here",
          projectId: "your-project-id",
          configId: "your-config-id"
        }
      });
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };
  
  return (
    <div style={{ padding: '20px' }}>
      <h1>NextEVI Voice Chat</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={handleConnect}
          disabled={readyState === 'connecting'}
        >
          {readyState === 'connected' ? 'Connected' : 'Connect'}
        </button>
        
        <button 
          onClick={disconnect}
          disabled={readyState === 'disconnected'}
          style={{ marginLeft: '10px' }}
        >
          Disconnect
        </button>
      </div>
      
      <div>Status: <strong>{readyState}</strong></div>
      
      <div style={{ marginTop: '20px', maxHeight: '400px', overflowY: 'auto' }}>
        {messages.map(message => (
          <div key={message.id} style={{ 
            marginBottom: '10px', 
            padding: '10px',
            backgroundColor: message.type === 'user' ? '#e3f2fd' : '#f3e5f5',
            borderRadius: '8px'
          }}>
            <strong>{message.type.toUpperCase()}:</strong> {message.content}
            <div style={{ fontSize: '12px', color: '#666' }}>
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
```

## API Reference

### VoiceProvider

The main provider component that wraps your application and provides voice functionality.

```tsx
<VoiceProvider debug={true}>
  {/* Your app components */}
</VoiceProvider>
```

**Props:**
- `debug?: boolean` - Enable debug logging
- `children: ReactNode` - Child components

### useVoice Hook

The primary hook for voice interactions, similar to Hume's EVI API.

```tsx
const {
  // Connection methods
  connect,
  disconnect,
  
  // State
  readyState,
  messages,
  isRecording,
  isTTSPlaying,
  isWaitingForResponse,
  connectionMetadata,
  error,
  
  // Utilities
  clearMessages,
  sendMessage
} = useVoice();
```

#### Connection

```tsx
await connect({
  auth: {
    apiKey: "oak_your_api_key",    // Required: NextEVI API key
    projectId: "your-project-id",   // Required: Project ID
    configId: "your-config-id",     // Required: Configuration ID
    websocketUrl?: "wss://...",     // Optional: Custom WebSocket URL
    debug?: true                    // Optional: Enable debug mode
  },
  audioConfig?: {
    sampleRate: 24000,             // Optional: Audio sample rate
    channels: 1,                   // Optional: Audio channels
    encoding: 'linear16',          // Optional: Audio encoding
    echoCancellation: true,        // Optional: Echo cancellation
    noiseSuppression: true,        // Optional: Noise suppression
    autoGainControl: false         // Optional: Auto gain control
  }
});
```

### Specialized Hooks

#### useVoiceStatus

Get connection status information:

```tsx
const {
  readyState,
  error,
  connectionMetadata,
  isConnected,
  isConnecting,
  isDisconnected,
  hasError
} = useVoiceStatus();
```

#### useVoiceMessages

Manage conversation messages:

```tsx
const {
  messages,
  userMessages,
  assistantMessages,
  systemMessages,
  errorMessages,
  lastMessage,
  hasStreamingMessages,
  isWaitingForResponse,
  clearMessages,
  sendMessage,
  messageCount,
  conversationLength
} = useVoiceMessages();
```

#### useVoiceAudio

Monitor audio activity:

```tsx
const {
  isRecording,
  isTTSPlaying,
  hasAudioActivity
} = useVoiceAudio();
```

#### useSimpleVoice

Simplified connection API:

```tsx
const voice = useSimpleVoice({ debug: true });

// Connect with individual parameters
await voice.connect(
  "oak_api_key",
  "project_id", 
  "config_id"
);
```

## Advanced Usage

### Custom Audio Configuration

```tsx
const { connect } = useVoice();

await connect({
  auth: {
    apiKey: "oak_your_api_key",
    projectId: "your-project",
    configId: "your-config"
  },
  audioConfig: {
    sampleRate: 24000,
    channels: 1,
    encoding: 'linear16',
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false
  }
});
```

### Environment Variables

You can set up your configuration using environment variables:

```bash
NEXTEVI_API_KEY=oak_your_api_key
NEXTEVI_PROJECT_ID=your-project-id
NEXTEVI_CONFIG_ID=your-config-id
NEXTEVI_DEBUG=true
```

Then use:

```tsx
import { configFromEnvironment, createConnectionConfig } from '@nextevi/voice-react';

const envConfig = configFromEnvironment();
const config = createConnectionConfig(
  envConfig.apiKey!,
  envConfig.projectId!,
  envConfig.configId!,
  envConfig
);
```

### Error Handling

```tsx
const { connect, error } = useVoice();

const handleConnect = async () => {
  try {
    await connect({ auth: config });
  } catch (error) {
    if (error.code === 'MICROPHONE_ACCESS_DENIED') {
      alert('Please allow microphone access to use voice chat');
    } else if (error.code === 'AUTHENTICATION_FAILED') {
      alert('Invalid API key or configuration');
    } else {
      console.error('Connection failed:', error);
    }
  }
};

// Also monitor the error state
useEffect(() => {
  if (error) {
    console.error('Voice error:', error);
  }
}, [error]);
```

### Development Utilities

```tsx
import { devUtils } from '@nextevi/voice-react';

// Check browser compatibility
const browserInfo = devUtils.checkEnvironment();
console.log('Browser support:', browserInfo.isSupported);

// Test microphone access
const micAccess = await devUtils.testMicrophone();
console.log('Microphone access:', micAccess);

// Validate configuration
const isValid = devUtils.validateConfiguration(config);
console.log('Config valid:', isValid);
```

## Browser Support

The SDK requires modern browsers with support for:

- WebSocket API
- Web Audio API (AudioContext)
- MediaDevices API (getUserMedia)
- AudioWorklet API

Supported browsers:
- Chrome 66+
- Firefox 76+
- Safari 14.1+
- Edge 79+

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```tsx
import type { 
  NextEVIConfig, 
  VoiceMessage, 
  ConnectionState,
  TranscriptionResult 
} from '@nextevi/voice-react';

const config: NextEVIConfig = {
  apiKey: "oak_key",
  projectId: "project",
  configId: "config"
};

const handleMessage = (message: VoiceMessage) => {
  console.log(`${message.type}: ${message.content}`);
};
```

## License

MIT

## Support

- Documentation: [NextEVI Documentation](https://docs.nextevi.com)
- Issues: [GitHub Issues](https://github.com/nextevi/nextevi-voice-react/issues)
- Email: support@nextevi.com