/**
 * Utility exports for NextEVI Voice React SDK
 */

// Re-export all utilities for convenience
export * from './auth';
export * from './audio';
export * from './websocket';

// Additional utility functions
export function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function getEmotionEmoji(emotion: string): string {
  const emotionEmojis: Record<string, string> = {
    'happy': '😊',
    'sad': '😢',
    'angry': '😠',
    'fear': '😨',
    'surprise': '😮',
    'disgust': '🤢',
    'neutral': '😐',
    'contempt': '😒',
    'unknown': '❓'
  };
  
  return emotionEmojis[emotion.toLowerCase()] || '❓';
}

export function calculateAverageConfidence(messages: { metadata?: { confidence?: number } }[]): number {
  const confidenceValues = messages
    .map(msg => msg.metadata?.confidence)
    .filter((conf): conf is number => conf !== undefined);
  
  if (confidenceValues.length === 0) return 0;
  
  return confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length;
}

export function getMessageStats(messages: { type: string; content: string; timestamp: Date }[]) {
  const stats = {
    total: messages.length,
    user: 0,
    assistant: 0,
    system: 0,
    error: 0,
    totalCharacters: 0,
    averageLength: 0,
    conversationDuration: 0
  };

  messages.forEach(msg => {
    stats[msg.type as keyof typeof stats]++;
    stats.totalCharacters += msg.content.length;
  });

  stats.averageLength = stats.total > 0 ? Math.round(stats.totalCharacters / stats.total) : 0;

  if (messages.length > 1) {
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    stats.conversationDuration = Math.round(
      (lastMessage.timestamp.getTime() - firstMessage.timestamp.getTime()) / 1000
    );
  }

  return stats;
}