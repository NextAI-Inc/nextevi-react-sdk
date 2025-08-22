/**
 * Authentication utilities for NextEVI Voice SDK
 * Handles API key validation and connection authentication
 */
import { NextEVIConfig, APIKeyAuthConfig, JWTAuthConfig } from '../types';
/**
 * Validate NextEVI API key format
 */
export declare function validateApiKey(apiKey: string): boolean;
/**
 * Validate JWT access token format
 */
export declare function validateJWTToken(token: string): boolean;
/**
 * Check if configuration uses JWT authentication
 */
export declare function isJWTAuth(config: NextEVIConfig): config is JWTAuthConfig;
/**
 * Check if configuration uses API key authentication
 */
export declare function isAPIKeyAuth(config: NextEVIConfig): config is APIKeyAuthConfig;
/**
 * Validate project ID format
 */
export declare function validateProjectId(projectId: string): boolean;
/**
 * Validate config ID format
 */
export declare function validateConfigId(configId: string): boolean;
/**
 * Validate complete NextEVI configuration
 */
export declare function validateConfig(config: NextEVIConfig): void;
/**
 * Validate WebSocket URL format
 */
export declare function isValidWebSocketUrl(url: string): boolean;
/**
 * Sanitize configuration for logging (hide sensitive data)
 */
export declare function sanitizeConfigForLogging(config: NextEVIConfig): any;
/**
 * Check if running in development environment
 */
export declare function isDevelopment(): boolean;
/**
 * Get default WebSocket URL based on environment
 */
export declare function getDefaultWebSocketUrl(): string;
/**
 * Create a connection configuration with API key
 */
export declare function createConnectionConfig(apiKey: string, projectId: string, configId: string, options?: Partial<APIKeyAuthConfig>): APIKeyAuthConfig;
/**
 * Create a connection configuration with JWT token
 */
export declare function createJWTConnectionConfig(accessToken: string, configId: string, options?: Partial<JWTAuthConfig>): JWTAuthConfig;
/**
 * Create connection config from any auth method (unified interface)
 */
export declare function createUnifiedConnectionConfig(auth: {
    apiKey?: string;
    projectId?: string;
    accessToken?: string;
    configId: string;
    type?: 'apiKey' | 'jwt';
    websocketUrl?: string;
    debug?: boolean;
}): NextEVIConfig;
/**
 * Parse NextEVI configuration from environment variables
 * Useful for server-side applications
 */
export declare function configFromEnvironment(): any;
/**
 * Utility to mask sensitive information in API keys for logging
 */
export declare function maskApiKey(apiKey: string): string;
/**
 * Generate a unique connection ID for tracking
 */
export declare function generateConnectionId(): string;
/**
 * Check if the current environment supports the NextEVI SDK
 */
export declare function isEnvironmentSupported(): boolean;
/**
 * Get browser compatibility information
 */
export declare function getBrowserInfo(): {
    isSupported: boolean;
    missingFeatures: string[];
    userAgent: string;
};
//# sourceMappingURL=auth.d.ts.map