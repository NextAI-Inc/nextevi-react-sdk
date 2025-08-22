#!/bin/bash

# NextEVI Voice SDK Real-time Testing Setup
echo "🚀 Setting up NextEVI Voice SDK testing environment..."

# Create test React app directory
TEST_DIR="nextevi-test-app"
mkdir -p $TEST_DIR
cd $TEST_DIR

# Initialize React app with Vite (faster than CRA)
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found. Please install Node.js first."
    exit 1
fi

echo "📦 Creating React app with Vite..."
npm create vite@latest . -- --template react-ts

# Install the local NextEVI SDK
echo "📥 Installing NextEVI Voice React SDK..."
npm install
npm install ../nextevi-voice-react-1.0.0.tgz

# Create test component
echo "📝 Creating test component..."
cat > src/VoiceTest.tsx << 'EOF'
import React, { useState } from 'react';
import { 
  VoiceProvider, 
  useVoice, 
  useVoiceStatus, 
  useVoiceMessages,
  useVoiceAudio,
  useVoiceIdleTimeout,
  useVoiceTurnDetection,
  quickStartUnified,
  type NextEVIConfig 
} from '@nextevi/voice-react';

function VoiceTestInner() {
  const [config, setConfig] = useState<NextEVIConfig | null>(null);
  const [apiKey, setApiKey] = useState('oak_');
  const [projectId, setProjectId] = useState('');
  const [configId, setConfigId] = useState('');
  const [authType, setAuthType] = useState<'apiKey' | 'jwt'>('apiKey');
  const [accessToken, setAccessToken] = useState('');

  // Use all the hooks to test functionality
  const { connect, disconnect, clearMessages } = useVoice();
  const { readyState, isConnected, hasError, error } = useVoiceStatus();
  const { messages, messageCount } = useVoiceMessages();
  const { isRecording, isTTSPlaying, hasAudioActivity } = useVoiceAudio();
  const { hasIdleWarning, timeRemaining, isFinalWarning } = useVoiceIdleTimeout();
  const { 
    isUserSpeaking, 
    isConversationActive, 
    turnCount, 
    averageResponseTime,
    hasRecentUtteranceEnd 
  } = useVoiceTurnDetection();

  const handleConnect = async () => {
    try {
      let connectionConfig: NextEVIConfig;
      
      if (authType === 'jwt') {
        if (!accessToken || !configId) {
          alert('Please provide JWT token and config ID');
          return;
        }
        connectionConfig = {
          type: 'jwt',
          accessToken: accessToken.trim(),
          configId: configId.trim(),
          debug: true
        };
      } else {
        if (!apiKey || !projectId || !configId) {
          alert('Please provide API key, project ID, and config ID');
          return;
        }
        connectionConfig = {
          type: 'apiKey',
          apiKey: apiKey.trim(),
          projectId: projectId.trim(),
          configId: configId.trim(),
          debug: true
        };
      }

      await connect({
        auth: connectionConfig,
        idleTimeout: {
          warningTimeout: 30, // 30 seconds
          hangupTimeout: 60,  // 60 seconds  
          enabled: true
        }
      });
    } catch (error: any) {
      alert('Connection failed: ' + error.message);
      console.error('Connection error:', error);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>NextEVI Voice SDK v1.1.0 Test</h1>

      {/* Configuration */}
      <div style={{ 
        border: '1px solid #ddd', 
        padding: '15px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        backgroundColor: '#f9f9f9'
      }}>
        <h3>Authentication</h3>
        <div style={{ marginBottom: '10px' }}>
          <label>
            <input
              type="radio"
              value="apiKey"
              checked={authType === 'apiKey'}
              onChange={(e) => setAuthType(e.target.value as 'apiKey')}
            />
            {' '}API Key Authentication
          </label>
          <label style={{ marginLeft: '20px' }}>
            <input
              type="radio"
              value="jwt"
              checked={authType === 'jwt'}
              onChange={(e) => setAuthType(e.target.value as 'jwt')}
            />
            {' '}JWT Authentication
          </label>
        </div>

        {authType === 'apiKey' ? (
          <>
            <input
              type="text"
              placeholder="API Key (oak_...)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ width: '100%', padding: '8px', margin: '5px 0', borderRadius: '4px', border: '1px solid #ddd' }}
            />
            <input
              type="text"
              placeholder="Project ID"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{ width: '100%', padding: '8px', margin: '5px 0', borderRadius: '4px', border: '1px solid #ddd' }}
            />
          </>
        ) : (
          <input
            type="text"
            placeholder="JWT Access Token"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            style={{ width: '100%', padding: '8px', margin: '5px 0', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        )}
        
        <input
          type="text"
          placeholder="Config ID"
          value={configId}
          onChange={(e) => setConfigId(e.target.value)}
          style={{ width: '100%', padding: '8px', margin: '5px 0', borderRadius: '4px', border: '1px solid #ddd' }}
        />
      </div>

      {/* Status Panel */}
      <div style={{ 
        border: '1px solid #ddd', 
        padding: '15px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        backgroundColor: hasError ? '#ffe6e6' : isConnected ? '#e6ffe6' : '#fff'
      }}>
        <h3>Connection Status</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <div>
            <div style={{ 
              display: 'inline-block', 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%',
              backgroundColor: isConnected ? '#28a745' : hasError ? '#dc3545' : '#6c757d',
              marginRight: '8px'
            }} />
            <strong>Status:</strong> {readyState}
          </div>
          <div><strong>Recording:</strong> {isRecording ? '🎤 ON' : '⭕ OFF'}</div>
          <div><strong>TTS Playing:</strong> {isTTSPlaying ? '🔊 ON' : '🔇 OFF'}</div>
          <div><strong>Audio Activity:</strong> {hasAudioActivity ? '✅ YES' : '❌ NO'}</div>
        </div>
        
        {error && (
          <div style={{ color: '#dc3545', marginTop: '10px' }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </div>

      {/* Advanced Features Status */}
      <div style={{ 
        border: '1px solid #ddd', 
        padding: '15px', 
        borderRadius: '8px', 
        marginBottom: '20px',
        backgroundColor: '#f0f8ff'
      }}>
        <h3>Advanced Features (New in v1.1.0)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px' }}>
          <div>
            <strong>Idle Warning:</strong> {hasIdleWarning ? 
              `⚠️ ${isFinalWarning ? 'FINAL' : 'WARNING'} (${timeRemaining}s)` : 
              '✅ None'
            }
          </div>
          <div><strong>User Speaking:</strong> {isUserSpeaking ? '🗣️ YES' : '🤐 NO'}</div>
          <div><strong>Conversation Active:</strong> {isConversationActive ? '💬 YES' : '😴 NO'}</div>
          <div><strong>Turn Count:</strong> {turnCount}</div>
          <div><strong>Avg Response:</strong> {averageResponseTime ? `${Math.round(averageResponseTime)}ms` : 'N/A'}</div>
          <div><strong>Recent Utterance End:</strong> {hasRecentUtteranceEnd ? '✅ YES' : '❌ NO'}</div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={handleConnect}
          disabled={isConnected}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            marginRight: '10px',
            cursor: isConnected ? 'not-allowed' : 'pointer'
          }}
        >
          Connect
        </button>
        <button
          onClick={disconnect}
          disabled={!isConnected}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            marginRight: '10px',
            cursor: !isConnected ? 'not-allowed' : 'pointer'
          }}
        >
          Disconnect
        </button>
        <button
          onClick={clearMessages}
          disabled={messageCount === 0}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: messageCount === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          Clear Messages ({messageCount})
        </button>
      </div>

      {/* Messages */}
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        padding: '15px'
      }}>
        <h3>Messages ({messageCount})</h3>
        <div style={{
          maxHeight: '400px',
          overflowY: 'auto',
          border: '1px solid #e9ecef',
          borderRadius: '4px',
          padding: '10px',
          backgroundColor: '#f8f9fa'
        }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#6c757d', fontStyle: 'italic', padding: '20px' }}>
              No messages yet. Connect and start speaking!
            </div>
          ) : (
            messages.map((message) => {
              const bgColor = {
                user: '#e3f2fd',
                assistant: '#f3e5f5', 
                system: '#e8f5e8',
                error: '#ffebee',
                warning: '#fff3cd'
              }[message.type] || '#f8f9fa';
              
              const borderColor = {
                user: '#1976d2',
                assistant: '#7b1fa2',
                system: '#388e3c', 
                error: '#d32f2f',
                warning: '#f57c00'
              }[message.type] || '#6c757d';

              return (
                <div
                  key={message.id}
                  style={{
                    marginBottom: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: bgColor,
                    borderLeft: `4px solid ${borderColor}`,
                    opacity: message.metadata?.isStreaming ? 0.7 : 1
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <strong style={{ textTransform: 'uppercase', fontSize: '12px' }}>
                      {message.type}
                      {message.metadata?.isStreaming && ' (streaming...)'}
                      {message.metadata?.turnComplete && ' ✅'}
                      {message.metadata?.isUtteranceEnd && ' 🔚'}
                    </strong>
                    <span style={{ fontSize: '11px', color: '#6c757d' }}>
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div>{message.content}</div>
                  {message.metadata?.confidence && (
                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                      Confidence: {(message.metadata.confidence * 100).toFixed(1)}%
                    </div>
                  )}
                  {message.metadata?.emotions && (
                    <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                      Emotions: {message.metadata.emotions.map(e => 
                        `${e.emotion} (${e.percentage.toFixed(1)}%)`
                      ).join(', ')}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Testing Instructions */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#e9ecef', 
        borderRadius: '4px' 
      }}>
        <h4>🧪 Testing Instructions:</h4>
        <ol>
          <li>Make sure your NextEVI backend is running (check port 8001)</li>
          <li>Fill in your authentication credentials above</li>
          <li>Click "Connect" and allow microphone access</li>
          <li>Start speaking to test voice recognition</li>
          <li>Try interrupting the AI while it's speaking</li>
          <li>Wait 30 seconds without speaking to test idle timeout</li>
          <li>Check browser console for detailed debug logs</li>
        </ol>
        
        <h4>🆕 New Features to Test:</h4>
        <ul>
          <li><strong>JWT Auth:</strong> Switch to JWT authentication mode</li>
          <li><strong>Turn Detection:</strong> Watch for turn completion indicators (✅)</li>
          <li><strong>Utterance End:</strong> Look for utterance end markers (🔚)</li>
          <li><strong>Idle Timeout:</strong> Watch for warning messages after inactivity</li>
          <li><strong>Enhanced Emotions:</strong> Look for emotion data in transcripts</li>
        </ul>
      </div>
    </div>
  );
}

export default function VoiceTest() {
  return (
    <VoiceProvider debug={true}>
      <VoiceTestInner />
    </VoiceProvider>
  );
}
EOF

# Update App.tsx to use our test component
cat > src/App.tsx << 'EOF'
import VoiceTest from './VoiceTest'
import './App.css'

function App() {
  return <VoiceTest />
}

export default App
EOF

# Update index.html title
sed -i 's/<title>.*<\/title>/<title>NextEVI Voice SDK Test<\/title>/' index.html

echo ""
echo "✅ NextEVI Voice SDK test environment created!"
echo ""
echo "🚀 To start testing:"
echo "   cd $TEST_DIR"
echo "   npm run dev"
echo ""
echo "📋 Then:"
echo "   1. Open the displayed localhost URL"
echo "   2. Make sure your NextEVI backend is running"
echo "   3. Enter your API credentials"
echo "   4. Click Connect and test!"
echo ""
echo "🔧 Backend should be running on: http://localhost:8001"
echo "🌐 Frontend will be on: http://localhost:5173"