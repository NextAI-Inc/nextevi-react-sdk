/**
 * Browser API Utilities
 * Properly bound browser APIs to prevent "Illegal invocation" errors
 *
 * This module provides safe, properly-bound versions of browser APIs
 * that can be used throughout the SDK without context issues.
 */
interface BoundBrowserAPIs {
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    atob: (data: string) => string;
    btoa: (data: string) => string;
    createObjectURL: (object: File | Blob | MediaSource) => string;
    revokeObjectURL: (url: string) => void;
    createAudioContext: (options?: AudioContextOptions) => AudioContext;
    getLocationInfo: () => {
        protocol: string;
        hostname: string;
        href: string;
    };
    isEnvironmentSupported: () => boolean;
    getUserAgent: () => string;
}
export declare const BrowserAPIs: BoundBrowserAPIs;
export declare const getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>, boundAtob: (data: string) => string, boundBtoa: (data: string) => string, createObjectURL: (object: File | Blob | MediaSource) => string, revokeObjectURL: (url: string) => void, createAudioContext: (options?: AudioContextOptions) => AudioContext, getLocationInfo: () => {
    protocol: string;
    hostname: string;
    href: string;
}, isEnvironmentSupported: () => boolean, getUserAgent: () => string;
export type { BoundBrowserAPIs };
/**
 * Utility function to check if we're in a browser environment
 */
export declare function isBrowserEnvironment(): boolean;
/**
 * Utility function to check if specific APIs are available
 */
export declare function checkAPISupport(): {
    allSupported: boolean;
    missingFeatures: string[];
    webSocket: boolean;
    audioContext: boolean;
    mediaDevices: boolean;
    audioWorklet: boolean;
    url: boolean;
    atob: boolean;
    btoa: boolean;
};
//# sourceMappingURL=browser-apis.d.ts.map