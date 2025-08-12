/**
 * Simple Voice Chat Example
 * Demonstrates basic usage of the NextEVI Voice React SDK
 */

import React, { useState, useEffect } from 'react';
import { 
  VoiceProvider, 
  useVoice, 
  useVoiceStatus, 
  useVoiceMessages,
  useVoiceAudio,
  type NextEVIConfig 
} from '@nextevi/voice-react';

// Configuration component
function VoiceConfig({ onSave }: { onSave: (config: NextEVIConfig) => void }) {
  const [apiKey, setApiKey] = useState('oak_');
  const [projectId, setProjectId] = useState('');
  const [configId, setConfigId] = useState('');

  const handleSave = () => {
    if (apiKey && projectId && configId) {
      onSave({
        apiKey: apiKey.trim(),
        projectId: projectId.trim(),
        configId: configId.trim(),
        debug: true
      });
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      border: '1px solid #ddd', 
      borderRadius: '8px',
      backgroundColor: '#f9f9f9',
      marginBottom: '20px'
    }}>
      <h3>Configuration</h3>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>API Key:</label>
        <input
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="oak_your_api_key_here"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Project ID:</label>
        <input
          type="text"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="your-project-id"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Config ID:</label>
        <input
          type="text"
          value={configId}
          onChange={(e) => setConfigId(e.target.value)}
          placeholder="your-config-id"
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>
      <button
        onClick={handleSave}
        disabled={!apiKey || !projectId || !configId}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: apiKey && projectId && configId ? 'pointer' : 'not-allowed'
        }}
      >
        Save Configuration
      </button>
    </div>
  );
}

// Connection controls
function ConnectionControls({ config }: { config: NextEVIConfig | null }) {
  const { connect, disconnect } = useVoice();
  const { readyState, isConnected, isConnecting, hasError } = useVoiceStatus();
  const [isConnectingState, setIsConnectingState] = useState(false);

  const handleConnect = async () => {
    if (!config) return;
    
    setIsConnectingState(true);
    try {
      await connect({
        auth: config,
        audioConfig: {
          sampleRate: 24000,
          channels: 1,
          encoding: 'linear16',
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      });
    } catch (error) {
      console.error('Connection failed:', error);
      alert(`Connection failed: ${error.message}`);
    } finally {
      setIsConnectingState(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
  };

  return (
    <div style={{
      padding: '20px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      marginBottom: '20px',
      backgroundColor: hasError ? '#ffe6e6' : isConnected ? '#e6ffe6' : '#fff'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: isConnected ? '#28a745' : hasError ? '#dc3545' : isConnecting ? '#ffc107' : '#6c757d'
        }} />
        <strong>Status: {readyState}</strong>
      </div>
      
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleConnect}
          disabled={!config || isConnected || isConnectingState}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: config && !isConnected && !isConnectingState ? 'pointer' : 'not-allowed'
          }}
        >
          {isConnectingState ? 'Connecting...' : 'Connect'}
        </button>
        
        <button
          onClick={handleDisconnect}
          disabled={!isConnected}
          style={{
            padding: '10px 20px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isConnected ? 'pointer' : 'not-allowed'
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

// Audio status indicator
function AudioStatus() {
  const { isRecording, isTTSPlaying, hasAudioActivity } = useVoiceAudio();

  return (
    <div style={{
      padding: '15px',
      border: '1px solid #ddd',
      borderRadius: '8px',
      marginBottom: '20px',
      backgroundColor: hasAudioActivity ? '#e3f2fd' : '#f8f9fa'
    }}>
      <h4>Audio Status</h4>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: isRecording ? '#28a745' : '#6c757d'
          }} />
          <span>Recording: {isRecording ? 'ON' : 'OFF'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: isTTSPlaying ? '#007bff' : '#6c757d'
          }} />
          <span>TTS Playing: {isTTSPlaying ? 'ON' : 'OFF'}</span>
        </div>
      </div>
    </div>
  );
}

// Message display
function MessageDisplay() {
  const { 
    messages, 
    clearMessages, 
    isWaitingForResponse,
    messageCount 
  } = useVoiceMessages();

  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '20px'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '15px'
      }}>
        <h4>Conversation ({messageCount} messages)</h4>
        <div>
          {isWaitingForResponse && (
            <span style={{ 
              color: '#ffc107', 
              fontSize: '14px',
              marginRight: '10px'
            }}>
              AI is thinking...
            </span>
          )}
          <button
            onClick={clearMessages}
            disabled={messageCount === 0}
            style={{
              padding: '5px 10px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: messageCount > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            Clear
          </button>
        </div>
      </div>
      
      <div style={{
        maxHeight: '400px',
        overflowY: 'auto',
        border: '1px solid #e9ecef',
        borderRadius: '4px',
        padding: '10px',
        backgroundColor: '#f8f9fa'
      }}>
        {messages.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#6c757d',
            fontStyle: 'italic',
            padding: '20px'
          }}>
            No messages yet. Connect and start speaking!
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              style={{
                marginBottom: '12px',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: getMessageBackgroundColor(message.type),
                border: `1px solid ${getMessageBorderColor(message.type)}`,
                opacity: message.metadata?.isStreaming ? 0.7 : 1
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '5px'
              }}>
                <strong style={{ 
                  color: getMessageTextColor(message.type),
                  textTransform: 'uppercase',
                  fontSize: '12px'
                }}>
                  {message.type}
                  {message.metadata?.isStreaming && ' (streaming...)'}
                </strong>
                <span style={{ 
                  fontSize: '11px', 
                  color: '#6c757d' 
                }}>
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div style={{ lineHeight: '1.4' }}>
                {message.content}
              </div>
              {message.metadata?.emotions && (
                <div style={{ 
                  marginTop: '8px', 
                  fontSize: '12px', 
                  color: '#6c757d' 
                }}>
                  Emotions: {message.metadata.emotions.map(e => 
                    `${e.emotion} (${e.percentage.toFixed(1)}%)`
                  ).join(', ')}
                </div>
              )}
              {message.metadata?.confidence && (
                <div style={{ 
                  marginTop: '5px', 
                  fontSize: '12px', 
                  color: '#6c757d' 
                }}>
                  Confidence: {(message.metadata.confidence * 100).toFixed(1)}%
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Helper functions for message styling
function getMessageBackgroundColor(type: string): string {
  switch (type) {
    case 'user': return '#e3f2fd';
    case 'assistant': return '#f3e5f5';
    case 'system': return '#e8f5e8';
    case 'error': return '#ffebee';
    default: return '#f8f9fa';
  }
}

function getMessageBorderColor(type: string): string {
  switch (type) {
    case 'user': return '#bbdefb';
    case 'assistant': return '#e1bee7';
    case 'system': return '#c8e6c9';
    case 'error': return '#ffcdd2';
    default: return '#e9ecef';
  }
}

function getMessageTextColor(type: string): string {
  switch (type) {
    case 'user': return '#1976d2';
    case 'assistant': return '#7b1fa2';
    case 'system': return '#388e3c';
    case 'error': return '#d32f2f';
    default: return '#6c757d';
  }
}

// Main voice chat component
function VoiceChatInner() {
  const [config, setConfig] = useState<NextEVIConfig | null>(null);
  const { error } = useVoiceStatus();

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        NextEVI Voice Chat Example
      </h1>
      
      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <VoiceConfig onSave={setConfig} />
      <ConnectionControls config={config} />
      <AudioStatus />
      <MessageDisplay />
      
      <div style={{
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        fontSize: '14px',
        color: '#6c757d'
      }}>
        <strong>Instructions:</strong>
        <ol style={{ marginTop: '10px', paddingLeft: '20px' }}>
          <li>Enter your NextEVI API credentials above</li>
          <li>Click "Connect" to establish a voice connection</li>
          <li>Allow microphone access when prompted</li>
          <li>Start speaking naturally - your speech will be transcribed</li>
          <li>The AI will respond with voice output</li>
          <li>You can interrupt the AI by speaking at any time</li>
        </ol>
      </div>
    </div>
  );
}

// Main component with provider
export default function SimpleVoiceChat() {
  return (
    <VoiceProvider debug={true}>
      <VoiceChatInner />
    </VoiceProvider>
  );
}