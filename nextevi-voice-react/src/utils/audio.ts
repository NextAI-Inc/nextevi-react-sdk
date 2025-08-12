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
   * Initialize audio processing
   */
  async initialize(): Promise<boolean> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: this.config.sampleRate },
          channelCount: this.config.channels,
          echoCancellation: this.config.echoCancellation,
          noiseSuppression: this.config.noiseSuppression,
          autoGainControl: this.config.autoGainControl
        }
      });

      // Create audio contexts
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
        latencyHint: 'interactive'
      });

      this.ttsAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
        latencyHint: 'interactive'
      });

      // Resume contexts if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      if (this.ttsAudioContext.state === 'suspended') {
        await this.ttsAudioContext.resume();
      }

      // Load AudioWorklet processors
      await this.loadWorkletProcessors();

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
      return false;
    }

    try {
      // Create and configure microphone worklet node
      this.micWorkletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');
      
      // Handle audio data from worklet
      this.micWorkletNode.port.onmessage = ({ data }) => {
        if (this.isRecording && data instanceof ArrayBuffer) {
          this.events.onAudioData?.(data);
        }
      };

      // Connect media stream to worklet
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.micWorkletNode);

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
      console.log('[NextEVI] Audio capture started');
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
    this.isRecording = false;

    if (this.micWorkletNode) {
      this.micWorkletNode.disconnect();
      this.micWorkletNode = null;
    }

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

    console.log('[NextEVI] Audio manager cleaned up');
  }

  // Private methods

  private async loadWorkletProcessors(): Promise<void> {
    if (!this.audioContext || !this.ttsAudioContext) {
      throw new Error('Audio contexts not initialized');
    }

    // Load PCM capture processor
    const pcmProcessorCode = this.getPCMProcessorCode();
    const pcmBlob = new Blob([pcmProcessorCode], { type: 'application/javascript' });
    const pcmProcessorUrl = URL.createObjectURL(pcmBlob);
    
    await this.audioContext.audioWorklet.addModule(pcmProcessorUrl);
    URL.revokeObjectURL(pcmProcessorUrl);

    // Load TTS playback processor
    const ttsProcessorCode = this.getTTSProcessorCode();
    const ttsBlob = new Blob([ttsProcessorCode], { type: 'application/javascript' });
    const ttsProcessorUrl = URL.createObjectURL(ttsBlob);
    
    await this.ttsAudioContext.audioWorklet.addModule(ttsProcessorUrl);
    URL.revokeObjectURL(ttsProcessorUrl);
  }

  private getPCMProcessorCode(): string {
    return `
      class PCMCaptureProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.chunkSize = 2048;
          this.buffer = new Float32Array(this.chunkSize);
          this.bufferIndex = 0;
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
          
          for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex] = channelData[i];
            this.bufferIndex++;
            
            if (this.bufferIndex >= this.chunkSize) {
              this.sendAudioChunk();
              this.bufferIndex = 0;
            }
          }
          
          return true;
        }
        
        sendAudioChunk() {
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
    const raw = atob(base64);
    const buffer = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buffer);
    
    for (let i = 0; i < raw.length; i++) {
      view[i] = raw.charCodeAt(i);
    }
    
    return new Int16Array(buffer);
  }
}

/**
 * Utility function to check if the browser supports the required audio APIs
 */
export function isAudioSupported(): boolean {
  return !!(
    navigator.mediaDevices &&
    'getUserMedia' in (navigator.mediaDevices || {}) &&
    window.AudioContext &&
    window.AudioContext.prototype.audioWorklet
  );
}

/**
 * Utility function to request microphone permissions
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.error('[NextEVI] Microphone permission denied:', error);
    return false;
  }
}