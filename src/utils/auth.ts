/**
 * Authentication utilities for NextEVI Voice SDK
 * Handles API key validation and connection authentication
 */

import { NextEVIConfig, NextEVIConfigLegacy, APIKeyAuthConfig, JWTAuthConfig, NextEVIError, ErrorCode } from '../types';

import {
  boundAtob,
  getLocationInfo,
  isBrowserEnvironment,
  getUserAgent,
  checkAPISupport
} from './browser-apis';

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
 * Validate JWT access token format
 */
export function validateJWTToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Basic JWT format validation (3 parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  
  // Check if each part is valid base64
  try {
    parts.forEach(part => {
      if (!part) throw new Error('Empty part');
      // Basic base64 validation using properly bound atob
      boundAtob(part.replace(/-/g, '+').replace(/_/g, '/'));
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if configuration uses JWT authentication
 */
export function isJWTAuth(config: NextEVIConfig): config is JWTAuthConfig {
  return 'accessToken' in config || (config as any).type === 'jwt';
}

/**
 * Check if configuration uses API key authentication
 */
export function isAPIKeyAuth(config: NextEVIConfig): config is APIKeyAuthConfig {
  return 'apiKey' in config || (config as any).type === 'apiKey' || !('type' in config) || (config as any).type === undefined;
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

  // Validate authentication credentials
  if (isJWTAuth(config)) {
    if (!validateJWTToken(config.accessToken)) {
      errors.push('Invalid JWT access token format');
    }
    // For JWT auth, projectId is optional but if provided, must be valid
    if (config.projectId && !validateProjectId(config.projectId)) {
      errors.push('Invalid project ID. Project ID cannot be empty');
    }
  } else if (isAPIKeyAuth(config)) {
    if (!validateApiKey(config.apiKey)) {
      errors.push('Invalid API key format. API key must start with "oak_"');
    }
    // For API key auth, projectId is required
    if (!config.projectId || !validateProjectId(config.projectId)) {
      errors.push('Invalid project ID. Project ID cannot be empty');
    }
  } else {
    errors.push('Authentication credentials required: provide either apiKey or accessToken');
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
export function sanitizeConfigForLogging(config: NextEVIConfig): any {
  if (isJWTAuth(config)) {
    return {
      ...config,
      accessToken: config.accessToken ? `${config.accessToken.substring(0, 20)}...` : undefined
    };
  } else if (isAPIKeyAuth(config)) {
    return {
      ...config,
      apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : undefined
    };
  }
  return config;
}

/**
 * Check if running in development environment
 */
export function isDevelopment(): boolean {
  if (!isBrowserEnvironment()) {
    return process.env.NODE_ENV === 'development';
  }
  
  const location = getLocationInfo();
  return process.env.NODE_ENV === 'development' || location.hostname === 'localhost';
}

/**
 * Get default WebSocket URL based on environment
 */
export function getDefaultWebSocketUrl(): string {
  if (!isBrowserEnvironment()) {
    // Server-side rendering fallback
    return 'wss://api.nextevi.com/ws/voice';
  }
  
  const location = getLocationInfo();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Development environment
    return `${protocol}//${hostname}:8001/ws/voice`;
  } else {
    // Production environment
    return `${protocol}//${hostname}/ws/voice`;
  }
}

/**
 * Create a connection configuration with API key
 */
export function createConnectionConfig(
  apiKey: string,
  projectId: string,
  configId: string,
  options: Partial<APIKeyAuthConfig> = {}
): APIKeyAuthConfig {
  const config: APIKeyAuthConfig = {
    type: 'apiKey',
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
 * Create a connection configuration with JWT token
 */
export function createJWTConnectionConfig(
  accessToken: string,
  configId: string,
  options: Partial<JWTAuthConfig> = {}
): JWTAuthConfig {
  const config: JWTAuthConfig = {
    type: 'jwt',
    accessToken: accessToken.trim(),
    configId: configId.trim(),
    projectId: options.projectId, // Optional for JWT auth
    websocketUrl: options.websocketUrl || getDefaultWebSocketUrl(),
    debug: options.debug || isDevelopment(),
    ...options
  };

  // Validate the configuration
  validateConfig(config);

  return config;
}

/**
 * Create connection config from any auth method (unified interface)
 */
export function createUnifiedConnectionConfig(auth: {
  apiKey?: string;
  projectId?: string;
  accessToken?: string;
  configId: string;
  type?: 'apiKey' | 'jwt';
  websocketUrl?: string;
  debug?: boolean;
}): NextEVIConfig {
  if (auth.accessToken || auth.type === 'jwt') {
    if (!auth.accessToken) {
      throw new NextEVIError('JWT access token is required for JWT authentication', ErrorCode.INVALID_CONFIG);
    }
    return createJWTConnectionConfig(auth.accessToken, auth.configId, {
      projectId: auth.projectId,
      websocketUrl: auth.websocketUrl,
      debug: auth.debug
    });
  } else {
    if (!auth.apiKey || !auth.projectId) {
      throw new NextEVIError('API key and project ID are required for API key authentication', ErrorCode.INVALID_CONFIG);
    }
    return createConnectionConfig(auth.apiKey, auth.projectId, auth.configId, {
      websocketUrl: auth.websocketUrl,
      debug: auth.debug
    });
  }
}

/**
 * Parse NextEVI configuration from environment variables
 * Useful for server-side applications
 */
export function configFromEnvironment(): any {
  const config: any = {};

  // Check for common environment variable names
  if (process.env.NEXTEVI_API_KEY) {
    config.apiKey = process.env.NEXTEVI_API_KEY;
  }

  if (process.env.NEXTEVI_ACCESS_TOKEN) {
    config.accessToken = process.env.NEXTEVI_ACCESS_TOKEN;
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

  // Determine auth type based on available credentials
  if (config.accessToken) {
    config.type = 'jwt';
  } else if (config.apiKey) {
    config.type = 'apiKey';
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
  if (!isBrowserEnvironment()) {
    return false; // Server-side environment
  }

  const support = checkAPISupport();
  return support.allSupported;
}

/**
 * Get browser compatibility information
 */
export function getBrowserInfo(): {
  isSupported: boolean;
  missingFeatures: string[];
  userAgent: string;
} {
  if (!isBrowserEnvironment()) {
    return {
      isSupported: false,
      missingFeatures: ['Browser environment required'],
      userAgent: 'Server-side'
    };
  }

  const support = checkAPISupport();
  
  return {
    isSupported: support.allSupported,
    missingFeatures: support.missingFeatures,
    userAgent: getUserAgent()
  };
}