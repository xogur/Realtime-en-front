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
    expect(parseSpokenConversationSelection('초 급으로 해 주세요').difficultyId).toBe('beginner');
    expect(parseSpokenConversationSelection('쉽게 해 주세요').difficultyId).toBe('beginner');
    expect(parseSpokenConversationSelection('중간으로 해 주세요').difficultyId).toBe('intermediate');
    expect(parseSpokenConversationSelection('어렵게 해 주세요').difficultyId).toBe('advanced');
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

  it.each([
    ['보통이요', 'intermediate'], ['쉬운 걸 선택할게요', 'beginner'],
    ['어려운 걸 해 볼래요', 'advanced'], ['beginner please', 'beginner'],
  ])('understands natural difficulty selection %s', (text, expected) => {
    expect(parseSpokenConversationSelection(text).difficultyId).toBe(expected);
  });

  it.each([
    ['음식 얘기 할래요', 'restaurant'], ['관광이요', 'travel'],
    ['free talk please', 'daily'], ['airport please', 'airport'],
  ])('understands topic selection %s', (text, expected) => {
    expect(parseSpokenConversationSelection(text).topicId).toBe(expected);
  });

  it('uses the current stage for numbered choices matching the card order', () => {
    expect(parseSpokenConversationSelection('일 번으로 해주세요', 'difficulty').difficultyId).toBe('beginner');
    expect(parseSpokenConversationSelection('2번', 'difficulty').difficultyId).toBe('intermediate');
    expect(parseSpokenConversationSelection('세 번째', 'difficulty').difficultyId).toBe('advanced');
    expect(parseSpokenConversationSelection('1번이요', 'topic').topicId).toBe('restaurant');
    expect(parseSpokenConversationSelection('2번', 'topic').topicId).toBe('airport');
    expect(parseSpokenConversationSelection('7번', 'topic').topicId).toBe('daily');
    expect(parseSpokenConversationSelection('4번', 'difficulty').difficultyId).toBeNull();
    expect(parseSpokenConversationSelection('1번')).toEqual({ difficultyId: null, topicId: null });
  });

  it.each(['초급 중급 고급', '초급은 아니요', '고급 말고', '쉬운 건 아니에요', 'hardly'])('does not force an ambiguous or negative difficulty: %s', (text) => {
    expect(parseSpokenConversationSelection(text).difficultyId).toBeNull();
  });

  it.each(['학교 아니고 가족', '학교생활 말고 가족'])('handles negation with overlapping topic words: %s', (text) => {
    expect(parseSpokenConversationSelection(text).topicId).toBe('family');
  });
});
