import type { DifficultyId } from '@/lib/conversationDifficulties';
import type { TopicId } from '@/lib/conversationTopics';

export type PendingConversationStart = {
  requestId: string;
  topicId: TopicId;
  difficultyId: DifficultyId;
  sent: boolean;
};

export function buildStartConversationMessage(pending: PendingConversationStart) {
  return {
    type: 'start_conversation' as const,
    requestId: pending.requestId,
    topicId: pending.topicId,
    difficultyId: pending.difficultyId,
  };
}
