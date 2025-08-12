/**
 * Authentication utilities for NextEVI Voice SDK
 * Handles API key validation and connection authentication
 */

import { NextEVIConfig, NextEVIError, ErrorCode } from '../types';

/**
 * Validate NextEVI API key format
 */
export function validateApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // NextEVI API keys start with 'oak_' prefix
  return apiKey.startsWith('oak_') && apiKey.length > 10;
}

/**
 * Validate project ID format
 */
export function validateProjectId(projectId: string): boolean {
  if (!projectId || typeof projectId !== 'string') {
    return false;
  }
  
  // Project IDs should be non-empty strings
  return projectId.trim().length > 0;
}

/**
 * Validate config ID format
 */
export function validateConfigId(configId: string): boolean {
  if (!configId || typeof configId !== 'string') {
    return false;
  }
  
  // Config IDs should be non-empty strings
  return configId.trim().length > 0;
}

/**
 * Validate complete NextEVI configuration
 */
export function validateConfig(config: NextEVIConfig): void {
  const errors: string[] = [];

  if (!validateApiKey(config.apiKey)) {
    errors.push('Invalid API key format. API key must start with "oak_"');
  }

  if (!validateProjectId(config.projectId)) {
    errors.push('Invalid project ID. Project ID cannot be empty');
  }

  if (!validateConfigId(config.configId)) {
    errors.push('Invalid config ID. Config ID cannot be empty');
  }

  if (config.websocketUrl && !isValidWebSocketUrl(config.websocketUrl)) {
    errors.push('Invalid WebSocket URL format');
  }

  if (errors.length > 0) {
    throw new NextEVIError(
      `Configuration validation failed: ${errors.join(', ')}`,
      ErrorCode.INVALID_CONFIG,
      { errors }
    );
  }
}

/**
 * Validate WebSocket URL format
 */
export function isValidWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Sanitize configuration for logging (hide sensitive data)
 */
export function sanitizeConfigForLogging(config: NextEVIConfig): Partial<NextEVIConfig> {
  return {
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : undefined
  };
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development' || 
         (typeof window !== 'undefined' && window.location.hostname === 'localhost');
}

/**
 * Get default WebSocket URL based on environment
 */
export function getDefaultWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side rendering fallback
    return 'wss://api.nextevi.com/ws/voice';
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Development environment
    return `${protocol}//${hostname}:8001/ws/voice`;
  } else {
    // Production environment
    return `${protocol}//${hostname}/ws/voice`;
  }
}

/**
 * Create a connection configuration with defaults
 */
export function createConnectionConfig(
  apiKey: string,
  projectId: string,
  configId: string,
  options: Partial<NextEVIConfig> = {}
): NextEVIConfig {
  const config: NextEVIConfig = {
    apiKey: apiKey.trim(),
    projectId: projectId.trim(),
    configId: configId.trim(),
    websocketUrl: options.websocketUrl || getDefaultWebSocketUrl(),
    debug: options.debug || isDevelopment(),
    ...options
  };

  // Validate the configuration
  validateConfig(config);

  return config;
}

/**
 * Parse NextEVI configuration from environment variables
 * Useful for server-side applications
 */
export function configFromEnvironment(): Partial<NextEVIConfig> {
  const config: Partial<NextEVIConfig> = {};

  // Check for common environment variable names
  if (process.env.NEXTEVI_API_KEY) {
    config.apiKey = process.env.NEXTEVI_API_KEY;
  }

  if (process.env.NEXTEVI_PROJECT_ID) {
    config.projectId = process.env.NEXTEVI_PROJECT_ID;
  }

  if (process.env.NEXTEVI_CONFIG_ID) {
    config.configId = process.env.NEXTEVI_CONFIG_ID;
  }

  if (process.env.NEXTEVI_WEBSOCKET_URL) {
    config.websocketUrl = process.env.NEXTEVI_WEBSOCKET_URL;
  }

  if (process.env.NEXTEVI_DEBUG) {
    config.debug = process.env.NEXTEVI_DEBUG === 'true';
  }

  return config;
}

/**
 * Utility to mask sensitive information in API keys for logging
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '*'.repeat(apiKey.length || 0);
  }
  
  return apiKey.substring(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.substring(apiKey.length - 4);
}

/**
 * Generate a unique connection ID for tracking
 */
export function generateConnectionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `voice_${timestamp}_${random}`;
}

/**
 * Check if the current environment supports the NextEVI SDK
 */
export function isEnvironmentSupported(): boolean {
  if (typeof window === 'undefined') {
    return false; // Server-side environment
  }

  const requiredFeatures = [
    'WebSocket' in window,
    'AudioContext' in window || 'webkitAudioContext' in window,
    'navigator' in window && 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
    'AudioWorkletNode' in window
  ];

  return requiredFeatures.every(feature => feature);
}

/**
 * Get browser compatibility information
 */
export function getBrowserInfo(): {
  isSupported: boolean;
  missingFeatures: string[];
  userAgent: string;
} {
  const missingFeatures: string[] = [];
  
  if (typeof window === 'undefined') {
    return {
      isSupported: false,
      missingFeatures: ['Browser environment required'],
      userAgent: 'Server-side'
    };
  }

  if (!('WebSocket' in window)) {
    missingFeatures.push('WebSocket');
  }

  if (!('AudioContext' in window) && !('webkitAudioContext' in window)) {
    missingFeatures.push('AudioContext');
  }

  if (!('navigator' in window) || 
      !('mediaDevices' in navigator) || 
      !('getUserMedia' in navigator.mediaDevices)) {
    missingFeatures.push('getUserMedia');
  }

  if (!('AudioWorkletNode' in window)) {
    missingFeatures.push('AudioWorkletNode');
  }

  return {
    isSupported: missingFeatures.length === 0,
    missingFeatures,
    userAgent: navigator.userAgent
  };
}