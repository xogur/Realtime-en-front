import { describe, expect, it } from 'vitest';
import {
  parseDirectSpokenDifficultySelection,
  parseSpokenConversationSelection,
} from './voiceTopicSelection';

describe('parseSpokenConversationSelection', () => {
  it('extracts a difficulty and topic from a fast combined answer', () => {
    expect(parseSpokenConversationSelection('초급으로 음식점 할게요')).toEqual({
      difficultyId: 'beginner',
      topicId: 'restaurant',
    });
  });

  it('understands natural Korean alternatives', () => {
    expect(parseSpokenConversationSelection('쉬운 걸로 해 주세요').difficultyId).toBe('beginner');
    expect(parseSpokenConversationSelection('레스토랑 상황이요').topicId).toBe('restaurant');
    expect(parseSpokenConversationSelection('그냥 프리토킹 할래요').topicId).toBe('daily');
  });

  it('uses the last choice when the user corrects themselves', () => {
    expect(parseSpokenConversationSelection('중급 말고 초급').difficultyId).toBe('beginner');
    expect(parseSpokenConversationSelection('음식점 아니고 공항').topicId).toBe('airport');
  });

  it('only fast-tracks a direct difficulty answer', () => {
    expect(parseDirectSpokenDifficultySelection('초급')).toBe('beginner');
    expect(parseDirectSpokenDifficultySelection('중급으로')).toBe('intermediate');
    expect(parseDirectSpokenDifficultySelection('고급이요')).toBe('advanced');
    expect(parseDirectSpokenDifficultySelection('중급 말고 초급')).toBeNull();
  });
});
