import { beforeEach, describe, expect, it } from 'vitest';

import { TURN } from './fixtures';
import { isFillerOnly, parseLessonTurn, silenceMs, useLessonTalkStore } from './lessonTalk';


describe('lesson talk messages', () => {
  beforeEach(() => useLessonTalkStore.getState().clear());

  it('parses a turn and keeps only known fields', () => {
    const turn = parseLessonTurn({ ...TURN, extra: '<script>' });
    expect(turn?.lines[1]).toEqual({ lang: 'en', text: 'Hi! What would you like?', role: 'role', subtitleKo: '안녕하세요! 무엇을 드릴까요?' });
    expect(turn?.progress?.turnTotal).toBe(5);
    expect(turn?.end).toBeNull();
  });

  it('parses the guide, how-to and word list a beginner sees', () => {
    const turn = parseLessonTurn({ ...TURN, display: {
      en: 'Here you are.', guideKo: '고맙다고 말해 봐.', howKo: '뭔가 받으면 Thank you라고 해.', frame: 'Thank ___.',
      words: [{ en: 'soup', ko: '수프' }, { en: 'tea' }, 'x', { en: 'juice', ko: '주스' }],
    } });
    expect(turn?.display).toEqual({
      en: 'Here you are.', guideKo: '고맙다고 말해 봐.', howKo: '뭔가 받으면 Thank you라고 해.', frame: 'Thank ___.',
      words: [{ en: 'soup', ko: '수프' }, { en: 'juice', ko: '주스' }],
    });
  });

  it('accepts setup turns with empty progress and choices for touch', () => {
    const turn = parseLessonTurn({
      talkId: 'talk-test01', seq: 1, stage: 'level', lines: [{ lang: 'ko', text: '처음이야?', role: 'coach' }],
      expect: { kind: 'speech', listenLang: 'ko', choices: [{ id: 'beginner', label: '처음이에요' }] }, progress: {},
    });
    expect(turn?.progress).toBeNull();
    expect(turn?.expect.choices).toEqual([{ id: 'beginner', label: '처음이에요' }]);
  });

  it('rejects malformed turns', () => {
    for (const bad of [
      { ...TURN, talkId: 'x' },
      { ...TURN, stage: 'quiz' },
      { ...TURN, lines: [{ lang: 'fr', text: 'Bonjour', role: 'role' }] },
      { ...TURN, expect: { kind: 'choice', listenLang: 'en' } },
      { ...TURN, expect: { kind: 'speech', listenLang: 'en', choices: [{ id: 'Bad Id', label: 'x' }] } },
      { ...TURN, progress: { ...TURN.progress, level: 'expert' } },
      { ...TURN, lines: Array.from({ length: 17 }, () => TURN.lines[0]) },
    ]) expect(parseLessonTurn(bad as Record<string, unknown>)).toBeNull();
  });

  it('parses the end of a lesson with an optional free-talk handoff', () => {
    const end = parseLessonTurn({ ...TURN, stage: 'end', expect: { kind: 'none', listenLang: 'en' }, next: 'FREE_TALK',
      freeTalk: { topicId: 'daily', difficultyId: 'beginner' } }, true);
    expect(end?.end).toEqual({ next: 'FREE_TALK', freeTalk: { topicId: 'daily', difficultyId: 'beginner' } });
    expect(parseLessonTurn({ ...TURN, next: 'MAYBE' }, true)).toBeNull();
  });

  it('stores turns, speech done, transcripts and failures; a new turn clears the old state', () => {
    const store = useLessonTalkStore.getState();
    expect(store.receive('lesson_talk_turn', TURN)).toBe(true);
    expect(store.receive('lesson_talk_speech_done', { talkId: 'talk-test01', seq: 3, ok: true })).toBe(true);
    expect(store.receive('lesson_talk_partial', { talkId: 'talk-test01', seq: 3, content: 'Water' })).toBe(true);
    expect(useLessonTalkStore.getState().transcript).toMatchObject({ text: 'Water', final: false });
    expect(store.receive('lesson_talk_error', { talkId: null, code: 'busy', content: '잠깐만' })).toBe(true);
    expect(useLessonTalkStore.getState().failure?.code).toBe('busy');
    expect(store.isCurrentLine({ talkId: 'talk-test01', seq: 3, index: 1 })).toBe(true);
    expect(store.isCurrentLine({ talkId: 'talk-test01', seq: 2, index: 1 })).toBe(false);
    store.receive('lesson_talk_turn', { ...TURN, seq: 4 });
    expect(useLessonTalkStore.getState()).toMatchObject({ speechDone: null, transcript: null, failure: null });
    expect(store.receive('lesson_talk_turn', { nope: true })).toBe(false);
  });

  it('treats thinking sounds as no answer and waits longer for children', () => {
    expect(isFillerOnly('Um... uh')).toBe(true);
    expect(isFillerOnly('음')).toBe(true);
    expect(isFillerOnly('Um, water please')).toBe(false);
    const turn = parseLessonTurn(TURN);
    expect(silenceMs(turn)).toBe(9_000);
    expect(silenceMs(parseLessonTurn({ ...TURN, progress: { ...TURN.progress, level: 'advanced' } }))).toBe(6_000);
    expect(silenceMs(parseLessonTurn({ ...TURN, expect: { kind: 'choice', listenLang: 'en', choices: [{ id: 'tea', label: 'Tea' }] } }))).toBe(12_000);
  });
});
