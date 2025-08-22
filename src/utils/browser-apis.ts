/**
 * Browser API Utilities
 * Properly bound browser APIs to prevent "Illegal invocation" errors
 * 
 * This module provides safe, properly-bound versions of browser APIs
 * that can be used throughout the SDK without context issues.
 */

// Type definitions for better TypeScript support
interface BoundBrowserAPIs {
  // Navigator APIs
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  
  // Window/Global APIs
  atob: (data: string) => string;
  btoa: (data: string) => string;
  
  // URL APIs
  createObjectURL: (object: File | Blob | MediaSource) => string;
  revokeObjectURL: (url: string) => void;
  
  // Audio Context APIs
  createAudioContext: (options?: AudioContextOptions) => AudioContext;
  
  // Location APIs
  getLocationInfo: () => {
    protocol: string;
    hostname: string;
    href: string;
  };
  
  // Environment checks
  isEnvironmentSupported: () => boolean;
  getUserAgent: () => string;
}

/**
 * Create properly bound browser APIs
 */
function createBoundBrowserAPIs(): BoundBrowserAPIs {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';
  
  if (!isBrowser) {
    // Server-side fallbacks
    return {
      getUserMedia: async () => {
        throw new Error('getUserMedia not supported in server environment');
      },
      atob: (data: string) => {
        // Node.js fallback
        return Buffer.from(data, 'base64').toString('binary');
      },
      btoa: (data: string) => {
        // Node.js fallback
        return Buffer.from(data, 'binary').toString('base64');
      },
      createObjectURL: () => {
        throw new Error('createObjectURL not supported in server environment');
      },
      revokeObjectURL: () => {
        // No-op in server environment
      },
      createAudioContext: () => {
        throw new Error('AudioContext not supported in server environment');
      },
      getLocationInfo: () => ({
        protocol: 'https:',
        hostname: 'localhost',
        href: 'https://localhost'
      }),
      isEnvironmentSupported: () => false,
      getUserAgent: () => 'Server-side'
    };
  }

  // Browser environment - create properly bound APIs
  const bound: BoundBrowserAPIs = {
    // Navigator MediaDevices API
    getUserMedia: navigator.mediaDevices?.getUserMedia 
      ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      : async () => {
          throw new Error('getUserMedia not supported');
        },
    
    // Global encoding/decoding functions
    atob: (typeof window.atob === 'function') 
      ? window.atob.bind(window)
      : (typeof atob === 'function')
        ? atob.bind(globalThis || window)
        : (data: string) => {
            throw new Error('atob not supported');
          },
    
    btoa: (typeof window.btoa === 'function')
      ? window.btoa.bind(window)
      : (typeof btoa === 'function')
        ? btoa.bind(globalThis || window)
        : (data: string) => {
            throw new Error('btoa not supported');
          },
    
    // URL APIs
    createObjectURL: (() => {
      const urlAPI = window.URL || (window as any).webkitURL;
      return urlAPI?.createObjectURL 
        ? urlAPI.createObjectURL.bind(urlAPI)
        : () => {
            throw new Error('createObjectURL not supported');
          };
    })(),
    
    revokeObjectURL: (() => {
      const urlAPI = window.URL || (window as any).webkitURL;
      return urlAPI?.revokeObjectURL
        ? urlAPI.revokeObjectURL.bind(urlAPI)
        : () => {
            // No-op if not supported
          };
    })(),
    
    // Audio Context creation
    createAudioContext: (options?: AudioContextOptions) => {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext not supported');
      }
      return new AudioContextClass(options);
    },
    
    // Location information
    getLocationInfo: () => ({
      protocol: window.location.protocol,
      hostname: window.location.hostname,
      href: window.location.href
    }),
    
    // Environment support check
    isEnvironmentSupported: () => {
      const requiredFeatures = [
        'WebSocket' in window,
        'AudioContext' in window || 'webkitAudioContext' in window,
        'navigator' in window && 
          'mediaDevices' in navigator && 
          'getUserMedia' in navigator.mediaDevices,
        'AudioWorkletNode' in window,
        'URL' in window || 'webkitURL' in window
      ];
      
      return requiredFeatures.every(feature => feature);
    },
    
    // User agent
    getUserAgent: () => navigator.userAgent || 'Unknown'
  };

  return bound;
}

// Create and export the bound APIs
export const BrowserAPIs = createBoundBrowserAPIs();

// Export individual APIs for convenience
export const {
  getUserMedia,
  atob: boundAtob,
  btoa: boundBtoa,
  createObjectURL,
  revokeObjectURL,
  createAudioContext,
  getLocationInfo,
  isEnvironmentSupported,
  getUserAgent
} = BrowserAPIs;

// Export type for external use
export type { BoundBrowserAPIs };

/**
 * Utility function to check if we're in a browser environment
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Utility function to check if specific APIs are available
 */
export function checkAPISupport() {
  const support = {
    webSocket: typeof WebSocket !== 'undefined',
    audioContext: typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined',
    mediaDevices: typeof navigator !== 'undefined' && 
                  'mediaDevices' in navigator && 
                  'getUserMedia' in navigator.mediaDevices,
    audioWorklet: typeof AudioWorkletNode !== 'undefined',
    url: typeof URL !== 'undefined' || typeof (window as any).webkitURL !== 'undefined',
    atob: typeof atob !== 'undefined',
    btoa: typeof btoa !== 'undefined'
  };

  return {
    ...support,
    allSupported: Object.values(support).every(Boolean),
    missingFeatures: Object.entries(support)
      .filter(([_, supported]) => !supported)
      .map(([feature]) => feature)
  };
}