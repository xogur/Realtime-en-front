import { beforeEach, describe, expect, it } from 'vitest';

import {
  listenSupport,
  matchSpokenChoice,
  nextListen,
  parseStoryCheckDecision,
  parseStoryCheckFailure,
  parseStoryCheckPrompt,
  parseStoryCheckSpeechDone,
  useStoryCheckStore,
} from './storyCheck';

const PROMPT = {
  checkId: 'check-0001', seq: 1, attempt: 0, kind: 'question', questionKo: '아빠는 뭘 봤어?',
  speechKo: '몇 가지 물어볼게. 아빠는 뭘 봤어?', index: 0, total: 2,
};
const DECISION = { checkId: 'check-0001', seq: 3, decision: 'REPLAY_SLOW', attempt: 0, nextAttempt: 1, speechKo: '천천히 다시 들려줄게.' };

describe('story check messages', () => {
  beforeEach(() => useStoryCheckStore.getState().clear());

  it('accepts a valid prompt and keeps no server-only fields', () => {
    const parsed = parseStoryCheckPrompt({ ...PROMPT, qid: 'cottage.q1', choiceOrder: [2, 0, 1] });
    expect(parsed).toEqual(PROMPT);
  });

  it.each([
    { ...PROMPT, checkId: 'bad id' },
    { ...PROMPT, seq: -1 },
    { ...PROMPT, attempt: 4 },
    { ...PROMPT, kind: 'quiz' },
    { ...PROMPT, kind: 'choices' },
    { ...PROMPT, choicesKo: ['하나'] },
    { ...PROMPT, choicesKo: ['a', 'b', 'c', 'd', 'e'] },
    { ...PROMPT, questionKo: 'x'.repeat(201) },
    { ...PROMPT, followUpKo: 3 },
  ])('drops a malformed prompt %#', (data) => {
    expect(parseStoryCheckPrompt(data as Record<string, unknown>)).toBeNull();
  });

  it('parses decisions, speech completion and failures fail-closed', () => {
    expect(parseStoryCheckDecision(DECISION)).toEqual(DECISION);
    expect(parseStoryCheckDecision({ ...DECISION, decision: 'SKIP' })).toBeNull();
    expect(parseStoryCheckDecision({ ...DECISION, nextAttempt: 5 })).toBeNull();
    expect(parseStoryCheckSpeechDone({ checkId: 'check-0001', seq: 2, ok: false })).toEqual({ checkId: 'check-0001', seq: 2, ok: false });
    expect(parseStoryCheckSpeechDone({ checkId: 'check-0001', seq: 2, ok: 'yes' })).toBeNull();
    expect(parseStoryCheckFailure({ checkId: null, code: 'unavailable', content: '없어요' })).toEqual({ checkId: null, code: 'unavailable', content: '없어요' });
    expect(parseStoryCheckFailure({ checkId: 'check-0001', code: 'x' })?.content).toBe('확인 질문을 이어가지 못했어요.');
    expect(parseStoryCheckFailure({ code: 5 })).toBeNull();
  });

  it('a new prompt clears the previous decision and speech completion', () => {
    const store = useStoryCheckStore.getState();
    expect(store.receive('story_check_decision', DECISION)).toBe(true);
    expect(store.receive('story_check_speech_done', { checkId: 'check-0001', seq: 3, ok: true })).toBe(true);
    expect(store.receive('story_check_prompt', PROMPT)).toBe(true);
    expect(useStoryCheckStore.getState()).toMatchObject({ prompt: PROMPT, decision: null, speechDone: null });
    expect(store.receive('story_check_prompt', { ...PROMPT, kind: 'nope' })).toBe(false);
    expect(useStoryCheckStore.getState().prompt).toEqual(PROMPT);
    expect(store.receive('free_talk', {})).toBe(false);
  });

  it('maps decisions to the listening ladder', () => {
    expect(nextListen('NEXT')).toEqual({ advance: true, attempt: 0 });
    expect(nextListen('REPLAY_SLOW')).toEqual({ advance: false, attempt: 1 });
    expect(nextListen('REPLAY_SLOW_EN')).toEqual({ advance: false, attempt: 2 });
    expect(nextListen('REPLAY_SLOW_KO')).toEqual({ advance: false, attempt: 3 });
    expect(nextListen('EXPLAIN_NEXT')).toEqual({ advance: true, attempt: 0 });
    expect([0, 1, 2, 3].map(listenSupport)).toEqual([
      { speed: 'normal', english: false, korean: false },
      { speed: 'slow', english: false, korean: false },
      { speed: 'slow', english: true, korean: false },
      { speed: 'slow', english: true, korean: true },
    ]);
  });
});

describe('spoken choice', () => {
  const choices = ['그냥 용일 뿐이에요', '거대한 양이에요', '커다란 말이에요'];
  it.each([
    ['1번', 0], ['일 번이요', 0], ['첫 번째', 0], ['두 번째요', 1], ['3번', 2], ['셋', 2],
    ['용이요', 0], ['용인 거', 0], ['양', 1], ['거대한 양이요', 1], ['말이에요', 2], ['커다란 거', 2],
  ])('"%s" picks %i', (text, index) => {
    expect(matchSpokenChoice(text, choices)).toBe(index);
  });
  it.each(['', '음', '모르겠어', '용 아니면 양', '4번', '이에요'])('"%s" is unclear', (text) => {
    expect(matchSpokenChoice(text, choices)).toBeNull();
  });
});
