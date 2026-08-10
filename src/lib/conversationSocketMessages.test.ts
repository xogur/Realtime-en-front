import { describe, expect, it } from 'vitest';

import { buildStartConversationMessage } from '@/lib/conversationSocketMessages';

describe('buildStartConversationMessage', () => {
  it('keeps the selected difficulty in every socket start request', () => {
    expect(buildStartConversationMessage({
      requestId: 'request-1',
      topicId: 'restaurant',
      difficultyId: 'beginner',
      sent: false,
    })).toEqual({
      type: 'start_conversation',
      requestId: 'request-1',
      topicId: 'restaurant',
      difficultyId: 'beginner',
    });
  });
});
