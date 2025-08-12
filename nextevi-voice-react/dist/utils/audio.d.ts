/**
 * Audio Processing Utilities for NextEVI Voice SDK
 * Handles microphone capture, PCM conversion, and TTS playback using AudioWorklet
 */
import { AudioConfig, AudioProcessor, NextEVIError } from '../types';
export interface AudioProcessorEvents {
    onAudioData: (data: ArrayBuffer) => void;
    onTTSPlayback: (isPlaying: boolean) => void;
    onError: (error: NextEVIError) => void;
}
export declare class AudioManager implements AudioProcessor {
    private mediaStream;
    private audioContext;
    private ttsAudioContext;
    private micWorkletNode;
    private ttsWorkletNode;
    private isRecording;
    private isTTSPlaying;
    private config;
    private events;
    constructor(config?: AudioConfig);
    /**
     * Set event handlers
     */
    setEvents(events: Partial<AudioProcessorEvents>): void;
    /**
     * Initialize audio processing
     */
    initialize(): Promise<boolean>;
    /**
     * Start audio capture and processing
     */
    start(): Promise<boolean>;
    /**
     * Stop audio capture
     */
    stop(): Promise<void>;
    /**
     * Play TTS audio chunk
     */
    playTTSChunk(audioData: string): void;
    /**
     * Clear TTS audio buffer (for interruptions)
     */
    clearTTSBuffer(): void;
    /**
     * Check if actively recording
     */
    isActive(): boolean;
    /**
     * Check if TTS is playing
     */
    isTTSActive(): boolean;
    /**
     * Get current audio configuration
     */
    getConfig(): AudioConfig;
    /**
     * Cleanup resources
     */
    cleanup(): Promise<void>;
    private loadWorkletProcessors;
    private getPCMProcessorCode;
    private getTTSProcessorCode;
    private base64ToInt16Array;
}
/**
 * Utility function to check if the browser supports the required audio APIs
 */
export declare function isAudioSupported(): boolean;
/**
 * Utility function to request microphone permissions
 */
export declare function requestMicrophonePermission(): Promise<boolean>;
//# sourceMappingURL=audio.d.ts.map