import { describe, expect, it } from 'vitest';

import { CONVERSATION_TOPICS, getConversationTopic, isTopicId } from './conversationTopics';

describe('conversation topics', () => {
  it('contains the seven approved topics', () => {
    expect(CONVERSATION_TOPICS.map((topic) => topic.id)).toEqual([
      'travel', 'restaurant', 'airport', 'hobby', 'school', 'family', 'daily',
    ]);
  });

  it('distinguishes roleplays and free talking', () => {
    expect(getConversationTopic('airport')?.modeLabel).toBe('역할극');
    expect(getConversationTopic('daily')?.modeLabel).toBe('프리토킹');
    expect(isTopicId('unknown')).toBe(false);
  });
});
