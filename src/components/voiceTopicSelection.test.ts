import { describe, expect, it } from 'vitest';
import {
  parseDirectSpokenDifficultySelection,
  parseSpokenConversationSelection,
  parseSpokenModeSelection,
} from './voiceTopicSelection';

describe('parseSpokenModeSelection', () => {
  it.each([
    ['프리 토킹 할게요', 'free_talk'], ['free talk please', 'free_talk'],
    ['학습 모드로 할게요', 'learning'], ['learning mode', 'learning'],
    ['1번', 'free_talk'], ['두 번째', 'learning'],
    ['프리토킹 말고 학습모드', 'learning'], ['학습모드는 아니고 프리토킹', 'free_talk'],
    ['이야기 듣기', 'story'], ['동화 들을래요', 'story'], ['3번', 'story'], ['세 번째', 'story'],
  ])('recognizes one mode from %s', (text, expected) => {
    expect(parseSpokenModeSelection(text)).toBe(expected);
  });
  it.each(['프리토킹 학습모드', '학습모드 말고', '그냥 할게요', '4번', '학습모드 이야기'])('rejects ambiguous or unsupported modes: %s', (text) => {
    expect(parseSpokenModeSelection(text)).toBeNull();
  });
  it.each([
    ['음, 2번이요', 'learning'], ['어 그 이야기 듣기요', 'story'], ['저기 그러니까 1번', 'free_talk'], ['음… 세 번째', 'story'],
  ])('ignores thinking sounds in %s', (text, expected) => {
    expect(parseSpokenModeSelection(text)).toBe(expected);
  });
  it.each(['음', '어 음'])('a thinking sound alone selects nothing: %s', (text) => {
    expect(parseSpokenModeSelection(text)).toBeNull();
  });
});

describe('one-sound STT misses (Crisper transcripts, 2026-10-14)', () => {
  it.each([
    ['박습할래요.', 'learning'], ['일본이요', 'free_talk'], ['프리투킹이요?', 'free_talk'],
  ])('mode: %s', (text, expected) => {
    expect(parseSpokenModeSelection(text)).toBe(expected);
  });
  it.each([
    ['쉬미.', 'hobby'], ['추미.', 'hobby'], ['공황이요.', 'airport'],
  ])('topic: %s', (text, expected) => {
    expect(parseSpokenConversationSelection(text, 'topic').topicId).toBe(expected);
  });
  it.each([['초극', 'beginner']])('difficulty: %s', (text, expected) => {
    expect(parseSpokenConversationSelection(text, 'difficulty').difficultyId).toBe(expected);
  });
  it.each([
    '동굴에 용이 있어서 아빠는 무서워했는데 소년은 걱정 말라고 했어', '바나나 주세요', '가자', '화장실이 어디예요?',
    '배고파요', '쉬미 말고', '코급',
  ])('never guesses a choice from other speech, a refusal or a sound between two choices: %s', (text) => {
    expect(parseSpokenModeSelection(text)).toBeNull();
    const parsed = parseSpokenConversationSelection(text);
    expect([parsed.difficultyId, parsed.topicId]).toEqual([null, null]);
  });
});

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

  it('ignores thinking sounds without breaking words that contain them', () => {
    expect(parseSpokenConversationSelection('음 일 번으로 해주세요', 'difficulty').difficultyId).toBe('beginner');
    expect(parseSpokenConversationSelection('어… 그러니까 2번', 'topic').topicId).toBe('airport');
    expect(parseSpokenConversationSelection('음 음식점이요', 'topic').topicId).toBe('restaurant');
  });

  it.each(['학교 아니고 가족', '학교생활 말고 가족'])('handles negation with overlapping topic words: %s', (text) => {
    expect(parseSpokenConversationSelection(text).topicId).toBe('family');
  });
});
