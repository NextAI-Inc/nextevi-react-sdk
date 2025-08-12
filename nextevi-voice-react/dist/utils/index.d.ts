/**
 * Utility exports for NextEVI Voice React SDK
 */
export * from './auth';
export * from './audio';
export * from './websocket';
export declare function formatTimestamp(date: Date): string;
export declare function formatDuration(seconds: number): string;
export declare function truncateText(text: string, maxLength: number): string;
export declare function getEmotionEmoji(emotion: string): string;
export declare function calculateAverageConfidence(messages: {
    metadata?: {
        confidence?: number;
    };
}[]): number;
export declare function getMessageStats(messages: {
    type: string;
    content: string;
    timestamp: Date;
}[]): {
    total: number;
    user: number;
    assistant: number;
    system: number;
    error: number;
    totalCharacters: number;
    averageLength: number;
    conversationDuration: number;
};
//# sourceMappingURL=index.d.ts.map