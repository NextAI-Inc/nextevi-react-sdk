/**
 * VoiceProvider - React Context Provider for NextEVI Voice SDK
 * Manages voice connection state, audio processing, and message history
 */
import { ReactNode } from 'react';
import { VoiceState, VoiceActions } from '../types';
interface VoiceContextValue extends VoiceState, VoiceActions {
}
interface VoiceProviderProps {
    children: ReactNode;
    debug?: boolean;
}
export declare function VoiceProvider({ children, debug }: VoiceProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useVoiceContext(): VoiceContextValue;
export {};
//# sourceMappingURL=VoiceProvider.d.ts.map