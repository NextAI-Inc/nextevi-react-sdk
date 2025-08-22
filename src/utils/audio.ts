/**
 * Audio Processing Utilities for NextEVI Voice SDK
 * Handles microphone capture, PCM conversion, and TTS playback using AudioWorklet
 */

import {
  AudioConfig,
  AudioProcessor,
  PCMData,
  NextEVIError,
  ErrorCode
} from '../types';

import {
  getUserMedia,
  createAudioContext,
  createObjectURL,
  revokeObjectURL,
  boundAtob,
  checkAPISupport
} from './browser-apis';

export interface AudioProcessorEvents {
  onAudioData: (data: ArrayBuffer) => void;
  onTTSPlayback: (isPlaying: boolean) => void;
  onError: (error: NextEVIError) => void;
}

export class AudioManager implements AudioProcessor {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private ttsAudioContext: AudioContext | null = null;
  private micWorkletNode: AudioWorkletNode | null = null;
  private ttsWorkletNode: AudioWorkletNode | null = null;
  private isRecording = false;
  private isTTSPlaying = false;
  private config: AudioConfig;
  private events: Partial<AudioProcessorEvents> = {};
  // Audio monitoring
  private audioLevelMonitor: number | null = null;
  private lastAudioLevel = 0;

  constructor(config: AudioConfig = {}) {
    this.config = {
      sampleRate: 24000,
      channels: 1,
      encoding: 'linear16',
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      ...config
    };
  }

  /**
   * Set event handlers
   */
  setEvents(events: Partial<AudioProcessorEvents>): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Ensure audio contexts are running (requires user interaction)
   */
  async ensureAudioContextsRunning(): Promise<boolean> {
    let success = true;
    
    if (this.audioContext && this.audioContext.state !== 'running') {
      console.log('[NextEVI] Attempting to resume suspended audio context');
      try {
        await this.audioContext.resume();
        console.log('[NextEVI] Audio context resumed, state:', this.audioContext.state);
      } catch (error) {
        console.error('[NextEVI] Failed to resume audio context:', error);
        success = false;
      }
    }
    
    if (this.ttsAudioContext && this.ttsAudioContext.state !== 'running') {
      console.log('[NextEVI] Attempting to resume suspended TTS audio context');
      try {
        await this.ttsAudioContext.resume();
        console.log('[NextEVI] TTS audio context resumed, state:', this.ttsAudioContext.state);
      } catch (error) {
        console.error('[NextEVI] Failed to resume TTS audio context:', error);
        success = false;
      }
    }
    
    return success;
  }

  /**
   * Initialize audio processing
   */
  async initialize(): Promise<boolean> {
    try {
      // Check microphone permissions first
      const permissionStatus = await checkMicrophonePermission();
      console.log('[NextEVI] Microphone permission status:', permissionStatus);
      
      if (permissionStatus === 'denied') {
        throw new NextEVIError(
          'Microphone access denied. Please enable microphone permissions.',
          ErrorCode.MICROPHONE_ACCESS_DENIED
        );
      }
      // Request microphone access with properly bound API and detailed constraints
      const audioConstraints = {
        audio: {
          sampleRate: { ideal: this.config.sampleRate },
          channelCount: { ideal: this.config.channels },
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl,
          // Add additional constraints for better audio quality
          latency: { ideal: 0.01 }, // Low latency
          volume: { ideal: 1.0 }
        }
      };
      
      console.log('[NextEVI] Requesting microphone access with constraints:', audioConstraints);
      
      this.mediaStream = await getUserMedia(audioConstraints);
      
      // Verify the stream and its settings
      console.log('[NextEVI] Microphone access granted');
      const audioTracks = this.mediaStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const track = audioTracks[0];
        const settings = track.getSettings();
        const capabilities = track.getCapabilities ? track.getCapabilities() : null;
        
        console.log('[NextEVI] Audio track settings:', settings);
        console.log('[NextEVI] Audio track capabilities:', capabilities);
        console.log('[NextEVI] Audio track constraints:', track.getConstraints());
        
        // Verify sample rate matches our config
        if (settings.sampleRate && settings.sampleRate !== this.config.sampleRate) {
          console.warn(`[NextEVI] Sample rate mismatch: expected ${this.config.sampleRate}, got ${settings.sampleRate}`);
        }
      } else {
        console.error('[NextEVI] No audio tracks found in media stream');
      }

      // Create audio contexts with proper binding
      this.audioContext = createAudioContext({
        sampleRate: this.config.sampleRate,
        latencyHint: 'interactive'
      });

      this.ttsAudioContext = createAudioContext({
        sampleRate: this.config.sampleRate,
        latencyHint: 'interactive'
      });

      // Resume contexts if suspended (requires user interaction)
      if (this.audioContext.state === 'suspended') {
        console.log('[NextEVI] Audio context suspended, attempting to resume...');
        try {
          await this.audioContext.resume();
          console.log('[NextEVI] Audio context resumed successfully, state:', this.audioContext.state);
        } catch (error) {
          console.warn('[NextEVI] Failed to resume audio context:', error);
        }
      } else {
        console.log('[NextEVI] Audio context state:', this.audioContext.state);
      }

      if (this.ttsAudioContext.state === 'suspended') {
        console.log('[NextEVI] TTS audio context suspended, attempting to resume...');
        try {
          await this.ttsAudioContext.resume();
          console.log('[NextEVI] TTS audio context resumed successfully, state:', this.ttsAudioContext.state);
        } catch (error) {
          console.warn('[NextEVI] Failed to resume TTS audio context:', error);
        }
      } else {
        console.log('[NextEVI] TTS audio context state:', this.ttsAudioContext.state);
      }

      // Load AudioWorklet processors with better error handling
      try {
        await this.loadWorkletProcessors();
        console.log('[NextEVI] AudioWorklet processors loaded successfully');
      } catch (error) {
        console.error('[NextEVI] Failed to load AudioWorklet processors:', error);
        throw error;
      }

      console.log('[NextEVI] Audio manager initialized successfully');
      return true;

    } catch (error) {
      const audioError = new NextEVIError(
        `Failed to initialize audio: ${(error as Error).message}`,
        (error as Error).name === 'NotAllowedError' ? ErrorCode.MICROPHONE_ACCESS_DENIED : ErrorCode.AUDIO_INITIALIZATION_FAILED,
        error
      );
      
      this.events.onError?.(audioError);
      return false;
    }
  }

  /**
   * Start audio capture and processing
   */
  async start(): Promise<boolean> {
    if (!this.audioContext || !this.mediaStream) {
      console.error('[NextEVI] Cannot start: missing audioContext or mediaStream');
      return false;
    }

    try {
      console.log('[NextEVI] Starting audio capture with context state:', this.audioContext.state);
      console.log('[NextEVI] MediaStream tracks:', this.mediaStream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })));
      
      // Ensure audio contexts are running
      const contextsRunning = await this.ensureAudioContextsRunning();
      if (!contextsRunning) {
        console.warn('[NextEVI] Audio contexts not fully running, but continuing...');
      }

      // Create and configure microphone worklet node
      this.micWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');
      console.log('[NextEVI] Created PCM capture worklet node');
      
      // Handle audio data from worklet with enhanced logging
      let audioDataCount = 0;
      this.micWorkletNode.port.onmessage = ({ data }) => {
        audioDataCount++;
        if (this.isRecording && data instanceof ArrayBuffer) {
          if (audioDataCount % 50 === 0) { // Log every 50th chunk to avoid spam
            console.log(`[NextEVI] Audio data chunk ${audioDataCount}: ${data.byteLength} bytes`);
          }
          this.events.onAudioData?.(data);
        } else if (this.isRecording) {
          console.warn('[NextEVI] Received invalid audio data:', typeof data);
        }
      };

      // Connect media stream to worklet with enhanced logging
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      console.log('[NextEVI] Created MediaStreamSource node');
      
      source.connect(this.micWorkletNode);
      console.log('[NextEVI] Connected MediaStreamSource to worklet');
      
      // Add analyzer node for debugging audio levels
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      // Monitor audio levels periodically
      this.startAudioLevelMonitoring(analyser);

      // Create and configure TTS playback worklet node
      this.ttsWorkletNode = new AudioWorkletNode(this.ttsAudioContext!, 'tts-playback-processor');
      
      // Handle TTS playback events
      this.ttsWorkletNode.port.onmessage = ({ data }) => {
        if (data.type === 'playbackStarted') {
          this.isTTSPlaying = true;
          this.events.onTTSPlayback?.(true);
        } else if (data.type === 'playbackStopped') {
          this.isTTSPlaying = false;
          this.events.onTTSPlayback?.(false);
        }
      };

      // Connect TTS worklet to audio output
      this.ttsWorkletNode.connect(this.ttsAudioContext!.destination);

      this.isRecording = true;
      console.log('[NextEVI] Audio capture started successfully');
      console.log('[NextEVI] Audio context sample rate:', this.audioContext.sampleRate);
      console.log('[NextEVI] Recording state:', this.isRecording);
      return true;

    } catch (error) {
      const audioError = new NextEVIError(
        `Failed to start audio processing: ${(error as Error).message}`,
        ErrorCode.AUDIO_INITIALIZATION_FAILED,
        error
      );
      
      this.events.onError?.(audioError);
      return false;
    }
  }

  /**
   * Stop audio capture
   */
  async stop(): Promise<void> {
    console.log('[NextEVI] Stopping audio capture...');
    this.isRecording = false;

    if (this.micWorkletNode) {
      this.micWorkletNode.disconnect();
      this.micWorkletNode = null;
      console.log('[NextEVI] Disconnected microphone worklet');
    }

    // Stop audio level monitoring
    this.stopAudioLevelMonitoring();

    console.log('[NextEVI] Audio capture stopped');
  }

  /**
   * Play TTS audio chunk
   */
  playTTSChunk(audioData: string): void {
    if (!this.ttsWorkletNode) {
      console.warn('[NextEVI] TTS worklet not initialized');
      return;
    }

    try {
      // Convert base64 to Int16Array
      const pcmData = this.base64ToInt16Array(audioData);
      
      // Send PCM data to TTS worklet
      this.ttsWorkletNode.port.postMessage(pcmData);
      
    } catch (error) {
      console.error('[NextEVI] Failed to play TTS chunk:', error);
    }
  }

  /**
   * Clear TTS audio buffer (for interruptions)
   */
  clearTTSBuffer(): void {
    if (this.ttsWorkletNode) {
      this.ttsWorkletNode.port.postMessage({ type: 'clear' });
    }
  }

  /**
   * Check if actively recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Check if TTS is playing
   */
  isTTSActive(): boolean {
    return this.isTTSPlaying;
  }

  /**
   * Get current audio configuration
   */
  getConfig(): AudioConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.isRecording = false;
    this.isTTSPlaying = false;

    // Stop microphone worklet
    if (this.micWorkletNode) {
      this.micWorkletNode.disconnect();
      this.micWorkletNode = null;
    }

    // Stop TTS worklet
    if (this.ttsWorkletNode) {
      this.ttsWorkletNode.disconnect();
      this.ttsWorkletNode = null;
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Close audio contexts
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ttsAudioContext) {
      await this.ttsAudioContext.close();
      this.ttsAudioContext = null;
    }

    // Stop audio monitoring
    this.stopAudioLevelMonitoring();

    console.log('[NextEVI] Audio manager cleaned up');
  }

  // Private methods

  private async loadWorkletProcessors(): Promise<void> {
    if (!this.audioContext || !this.ttsAudioContext) {
      throw new Error('Audio contexts not initialized');
    }

    // Load PCM capture processor with properly bound APIs
    const pcmProcessorCode = this.getPCMProcessorCode();
    const pcmBlob = new Blob([pcmProcessorCode], { type: 'application/javascript' });
    const pcmProcessorUrl = createObjectURL(pcmBlob);
    
    await this.audioContext.audioWorklet.addModule(pcmProcessorUrl);
    revokeObjectURL(pcmProcessorUrl);

    // Load TTS playback processor with properly bound APIs
    const ttsProcessorCode = this.getTTSProcessorCode();
    const ttsBlob = new Blob([ttsProcessorCode], { type: 'application/javascript' });
    const ttsProcessorUrl = createObjectURL(ttsBlob);
    
    await this.ttsAudioContext.audioWorklet.addModule(ttsProcessorUrl);
    revokeObjectURL(ttsProcessorUrl);
  }

  private getPCMProcessorCode(): string {
    return `
      class PCMCaptureProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.chunkSize = 2048;
          this.buffer = new Float32Array(this.chunkSize);
          this.bufferIndex = 0;
          this.chunksProcessed = 0;
          this.silentChunks = 0;
          console.log('[PCMProcessor] Worklet processor initialized');
        }
        
        process(inputs) {
          const input = inputs[0];
          
          if (!input || input.length === 0) {
            return true;
          }
          
          const channelData = input[0];
          
          if (!channelData || channelData.length === 0) {
            return true;
          }
          
          // Check for audio activity
          let hasActivity = false;
          let maxAmplitude = 0;
          
          for (let i = 0; i < channelData.length; i++) {
            const sample = Math.abs(channelData[i]);
            if (sample > maxAmplitude) maxAmplitude = sample;
            if (sample > 0.001) hasActivity = true; // Threshold for activity
            
            this.buffer[this.bufferIndex] = channelData[i];
            this.bufferIndex++;
            
            if (this.bufferIndex >= this.chunkSize) {
              this.sendAudioChunk(maxAmplitude, hasActivity);
              this.bufferIndex = 0;
              maxAmplitude = 0;
              hasActivity = false;
            }
          }
          
          return true;
        }
        
        sendAudioChunk(maxAmplitude, hasActivity) {
          this.chunksProcessed++;
          
          if (!hasActivity) {
            this.silentChunks++;
          } else {
            // Reset silent chunk counter on activity
            if (this.silentChunks > 0) {
              console.log('[PCMProcessor] Audio activity resumed after', this.silentChunks, 'silent chunks');
              this.silentChunks = 0;
            }
          }
          
          // Log periodically
          if (this.chunksProcessed % 100 === 0) {
            console.log('[PCMProcessor] Processed', this.chunksProcessed, 'chunks, silent:', this.silentChunks, 'max amplitude:', maxAmplitude.toFixed(4));
          }
          
          const pcmData = this.float32ToPCM16(this.buffer);
          this.port.postMessage(pcmData.buffer);
        }
        
        float32ToPCM16(float32Array) {
          const pcm16Array = new Int16Array(float32Array.length);
          
          for (let i = 0; i < float32Array.length; i++) {
            let sample = Math.max(-1.0, Math.min(1.0, float32Array[i]));
            pcm16Array[i] = sample < 0 ? sample * 32768 : sample * 32767;
          }
          
          return pcm16Array;
        }
      }
      
      registerProcessor('pcm-capture-processor', PCMCaptureProcessor);
    `;
  }

  private getTTSProcessorCode(): string {
    return `
      class TTSPlaybackProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.bufferQueue = [];
          this.readOffset = 0;
          this.samplesRemaining = 0;
          this.isPlaying = false;

          this.port.onmessage = (event) => {
            if (event.data && typeof event.data === "object" && event.data.type === "clear") {
              this.bufferQueue = [];
              this.readOffset = 0;
              this.samplesRemaining = 0;
              this.isPlaying = false;
              return;
            }
            
            this.bufferQueue.push(event.data);
            this.samplesRemaining += event.data.length;
          };
        }

        process(inputs, outputs) {
          const outputChannel = outputs[0][0];

          if (this.samplesRemaining === 0) {
            outputChannel.fill(0);
            if (this.isPlaying) {
              this.isPlaying = false;
              this.port.postMessage({ type: 'playbackStopped' });
            }
            return true;
          }

          if (!this.isPlaying) {
            this.isPlaying = true;
            this.port.postMessage({ type: 'playbackStarted' });
          }

          let outIdx = 0;
          while (outIdx < outputChannel.length && this.bufferQueue.length > 0) {
            const currentBuffer = this.bufferQueue[0];
            const sampleValue = currentBuffer[this.readOffset] / 32768;
            outputChannel[outIdx++] = sampleValue;

            this.readOffset++;
            this.samplesRemaining--;

            if (this.readOffset >= currentBuffer.length) {
              this.bufferQueue.shift();
              this.readOffset = 0;
            }
          }

          while (outIdx < outputChannel.length) {
            outputChannel[outIdx++] = 0;
          }

          return true;
        }
      }
      
      registerProcessor('tts-playback-processor', TTSPlaybackProcessor);
    `;
  }

  private base64ToInt16Array(base64: string): Int16Array {
    const raw = boundAtob(base64);
    const buffer = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buffer);
    
    for (let i = 0; i < raw.length; i++) {
      view[i] = raw.charCodeAt(i);
    }
    
    return new Int16Array(buffer);
  }

  /**
   * Start monitoring audio input levels for debugging
   */
  private startAudioLevelMonitoring(analyser: AnalyserNode): void {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const monitorLevels = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average amplitude
      const sum = dataArray.reduce((acc, value) => acc + value, 0);
      const average = sum / dataArray.length;
      
      // Only log if there's a significant change to avoid spam
      if (Math.abs(average - this.lastAudioLevel) > 5) {
        console.log(`[NextEVI] Audio input level: ${average.toFixed(1)}/255`);
        this.lastAudioLevel = average;
      }
      
      // Detect silence vs activity
      if (average > 10) {
        if (this.lastAudioLevel <= 10) {
          console.log('[NextEVI] 🎤 Audio activity detected');
        }
      } else if (this.lastAudioLevel > 10) {
        console.log('[NextEVI] 🔇 Audio silence detected');
      }
    };
    
    // Monitor every 100ms
    this.audioLevelMonitor = window.setInterval(monitorLevels, 100);
    console.log('[NextEVI] Started audio level monitoring');
  }

  /**
   * Stop monitoring audio input levels
   */
  private stopAudioLevelMonitoring(): void {
    if (this.audioLevelMonitor) {
      clearInterval(this.audioLevelMonitor);
      this.audioLevelMonitor = null;
      console.log('[NextEVI] Stopped audio level monitoring');
    }
  }
}

/**
 * Utility function to check if the browser supports the required audio APIs
 */
export function isAudioSupported(): boolean {
  const support = checkAPISupport();
  return support.mediaDevices && support.audioContext && support.audioWorklet;
}

/**
 * Utility function to request microphone permissions
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    console.log('[NextEVI] Requesting microphone permission...');
    const stream = await getUserMedia({ audio: true });
    
    // Test the stream
    const tracks = stream.getAudioTracks();
    console.log('[NextEVI] Microphone permission granted, tracks:', tracks.length);
    
    if (tracks.length > 0) {
      const track = tracks[0];
      console.log('[NextEVI] Audio track info:', {
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
    }
    
    stream.getTracks().forEach(track => track.stop());
    console.log('[NextEVI] Test microphone stream stopped');
    return true;
  } catch (error: any) {
    console.error('[NextEVI] Microphone permission denied:', error);
    console.error('[NextEVI] Error details:', {
      name: error.name,
      message: error.message,
      constraint: error.constraint
    });
    return false;
  }
}

/**
 * Check current microphone permission status
 */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  if (!navigator.permissions) {
    console.log('[NextEVI] Permissions API not supported');
    return 'unknown';
  }
  
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    console.log('[NextEVI] Microphone permission status:', result.state);
    return result.state as 'granted' | 'denied' | 'prompt';
  } catch (error) {
    console.error('[NextEVI] Error checking microphone permission:', error);
    return 'unknown';
  }
}