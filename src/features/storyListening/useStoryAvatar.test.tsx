// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/stores/useStore';

import { useStoryCheckStore } from './storyCheck';
import { DECISION_PAUSE_MS, PASSED_AUTO_NEXT_MS, useStoryAvatar } from './useStoryAvatar';

const fake = vi.hoisted(() => ({
  player: { index: 0, playing: false, finished: false, waiting: false, loading: false, blocked: false, error: null as string | null, progress: 0, duration: 0 },
  setPlayer: null as null | ((patch: Record<string, unknown>) => void),
  speeds: [] as string[],
  jumps: [] as Array<[number, boolean]>,
  play: vi.fn(),
  pause: vi.fn(),
  seekBy: vi.fn(),
  listen: vi.fn(),
  stopListening: vi.fn(),
  forget: vi.fn(),
  listener: null as null | { onAnswer: (text: string) => void; onUnavailable: () => void; avatarLine: () => string },
  publish: vi.fn(),
  /** Like a real clip that is still loading: the old `finished` lingers for a moment after jump. */
  lateReset: false,
}));

vi.mock('./useSentencePlayer', async () => {
  const { useState } = await import('react');
  return {
    useSentencePlayer: (_lines: string[], speed: string) => {
      const [state, setState] = useState(fake.player);
      fake.setPlayer = (patch) => setState((current) => ({ ...current, ...patch }));
      fake.speeds.push(speed);
      return {
        ...state, play: fake.play, pause: fake.pause, seekBy: fake.seekBy, release: vi.fn(),
        jump: (index: number, autoplay = true) => {
          fake.jumps.push([index, autoplay]);
          if (fake.lateReset) {
            setState((current) => ({ ...current, index, playing: autoplay }));
            window.setTimeout(() => setState((current) => ({ ...current, finished: false })), 50);
          } else {
            setState((current) => ({ ...current, index, finished: false, playing: autoplay }));
          }
        },
      };
    },
  };
});
vi.mock('./useStoryAnswerListener', () => ({
  useStoryAnswerListener: (options: NonNullable<typeof fake.listener>) => {
    fake.listener = options;
    return { state: 'idle', heard: '', answer: '', listen: fake.listen, stop: fake.stopListening, forget: fake.forget };
  },
}));
vi.mock('./control', () => ({ createStoryViewPublisher: () => ({ publish: fake.publish, reset: vi.fn() }) }));

const send = vi.fn((message: Record<string, unknown>) => { void message; return true; });
const stopAvatarSpeech = vi.fn();

function render() {
  return renderHook(() => useStoryAvatar({ kioskId: 'A01', isConnected: true, sendStoryCheck: send, stopAvatarSpeech }));
}

function lastSent(type: string) {
  return [...send.mock.calls].reverse().map(([message]) => message).find((message) => message.type === type);
}

async function finishChapter() {
  await act(async () => fake.setPlayer!({ finished: true, playing: false }));
  await act(async () => { vi.advanceTimersByTime(0); });
  return lastSent('story_check_start')!.checkId as string;
}

async function receive(type: string, data: Record<string, unknown>) {
  await act(async () => { useStoryCheckStore.getState().receive(type, data); });
}

const prompt = (checkId: string, seq: number, extra: Record<string, unknown> = {}) => ({
  checkId, seq, attempt: 0, kind: 'question', questionKo: '아빠는 뭘 봤어?', speechKo: '아빠는 뭘 봤어?', index: 0, total: 2, ...extra,
});

describe('avatar story flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fake.speeds = []; fake.jumps = []; fake.listener = null; fake.lateReset = false;
    fake.player = { ...fake.player, index: 0, playing: false, finished: false };
    useStore.setState({ isPlaying: false, audioAnalyser: null });
    useStoryCheckStore.getState().clear();
  });
  afterEach(() => vi.useRealTimers());

  it('narrates the picked story from its first chapter and mirrors the view', async () => {
    const { result } = render();
    expect(result.current.phase).toBe('picker');
    await act(async () => result.current.pick('reluctant-dragon'));
    expect(result.current).toMatchObject({ phase: 'listening', chapterIndex: 0, attempt: 0 });
    expect(fake.jumps.at(-1)).toEqual([0, true]);
    expect(fake.publish).toHaveBeenLastCalledWith('reluctant-dragon', { phase: 'listening', chapterIndex: 0, sentenceIndex: 0 });
  });

  it('starts the server check when the chapter ends and listens only after the question was fully spoken', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const checkId = await finishChapter();
    expect(lastSent('story_check_start')).toMatchObject({ storyId: 'reluctant-dragon', chapterId: 'cottage', attempt: 0 });
    expect(fake.publish).toHaveBeenLastCalledWith('reluctant-dragon', expect.objectContaining({ phase: 'checking' }));

    await receive('story_check_prompt', prompt(checkId, 1));
    expect(result.current.check.status).toBe('speaking');
    await act(async () => useStore.setState({ isPlaying: true }));
    await receive('story_check_speech_done', { checkId, seq: 1, ok: true });
    expect(fake.listen).not.toHaveBeenCalled();
    await act(async () => useStore.setState({ isPlaying: false }));
    expect(fake.listen).toHaveBeenCalledTimes(1);
    expect(result.current.check.status).toBe('listening');

    await act(async () => fake.listener!.onAnswer('말 네 마리만 한 거'));
    await act(async () => fake.listener!.onAnswer('중복'));
    const answers = send.mock.calls.map(([message]) => message).filter((message) => message.type === 'story_check_answer');
    expect(answers).toEqual([{ type: 'story_check_answer', checkId, seq: 1, kind: 'speech', text: '말 네 마리만 한 거' }]);
    expect(result.current.check.status).toBe('thinking');
  });

  it('ignores messages of another check', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    await finishChapter();
    await receive('story_check_prompt', prompt('check-stale-1', 1));
    expect(result.current.check.prompt).toBeNull();
    expect(result.current.check.status).toBe('starting');
  });

  it('follows the ladder: slower, then English subtitles, then the Korean translation, then the next chapter', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const ladder = [['REPLAY_SLOW', 0, 1], ['REPLAY_SLOW_EN', 1, 2], ['REPLAY_SLOW_KO', 2, 3]] as const;
    const supports = [
      { speed: 'slow', english: false, korean: false },
      { speed: 'slow', english: true, korean: false },
      { speed: 'slow', english: true, korean: true },
    ];
    for (const [step, [decision, attempt, nextAttempt]] of ladder.entries()) {
      const checkId = await finishChapter();
      await receive('story_check_decision', { checkId, seq: 3, decision, attempt, nextAttempt, speechKo: '다시 들려줄게.' });
      await receive('story_check_speech_done', { checkId, seq: 3, ok: true });
      await act(async () => { vi.advanceTimersByTime(DECISION_PAUSE_MS - 1); });
      expect(result.current.phase).toBe('checking');
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(result.current).toMatchObject({ phase: 'listening', chapterIndex: 0, attempt: nextAttempt });
      expect(fake.jumps.at(-1)).toEqual([0, true]);
      expect(result.current.support).toEqual(supports[step]);
    }
    expect(fake.speeds.at(-1)).toBe('slow');
    const checkId = await finishChapter();
    expect(lastSent('story_check_start')).toMatchObject({ attempt: 3 });
    await receive('story_check_decision', { checkId, seq: 4, decision: 'EXPLAIN_NEXT', attempt: 3, nextAttempt: 0, speechKo: '정리해 줄게.' });
    await receive('story_check_speech_done', { checkId, seq: 4, ok: true });
    await act(async () => { vi.advanceTimersByTime(DECISION_PAUSE_MS); });
    expect(result.current).toMatchObject({ phase: 'listening', chapterIndex: 1, attempt: 0 });
  });

  it('treats silence as "잘 모르겠어" and offers touch choices from the server', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const checkId = await finishChapter();
    await receive('story_check_prompt', prompt(checkId, 1));
    await receive('story_check_speech_done', { checkId, seq: 1, ok: true });
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(lastSent('story_check_answer')).toMatchObject({ seq: 1, kind: 'unknown' });
    await receive('story_check_prompt', prompt(checkId, 2, { kind: 'choices', choicesKo: ['양', '커다란 무언가', '비'] }));
    await receive('story_check_speech_done', { checkId, seq: 2, ok: true });
    expect(result.current.check.status).toBe('choices');
    await act(async () => result.current.choose(1));
    expect(lastSent('story_check_answer')).toMatchObject({ seq: 2, kind: 'touch', choiceIndex: 1 });
  });

  it('lets the learner pick a shown choice by voice and keeps listening on an unclear reply', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const checkId = await finishChapter();
    await receive('story_check_prompt', prompt(checkId, 2, { kind: 'choices', choicesKo: ['그냥 용일 뿐이에요', '거대한 양이에요', '커다란 말이에요'] }));
    await receive('story_check_speech_done', { checkId, seq: 2, ok: true });
    expect(result.current.check.status).toBe('choices');
    expect(fake.listen).toHaveBeenCalledTimes(1);

    await act(async () => fake.listener!.onUnavailable());
    await act(async () => fake.listener!.onAnswer('음 글쎄'));
    expect(lastSent('story_check_answer')).toBeUndefined();
    expect(result.current.check.choiceMiss).toBe('음 글쎄');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(fake.listen).toHaveBeenCalledTimes(2);

    await act(async () => fake.listener!.onAnswer('두 번째요'));
    expect(lastSent('story_check_answer')).toEqual({ type: 'story_check_answer', checkId, seq: 2, kind: 'touch', choiceIndex: 1 });
    expect(result.current.check.status).toBe('thinking');
  });

  it('pauses a question without the microphone and asks again on resume', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const checkId = await finishChapter();
    await receive('story_check_prompt', prompt(checkId, 1));
    await act(async () => result.current.togglePause());
    expect(lastSent('story_check_pause')).toEqual({ type: 'story_check_pause', checkId });
    expect(stopAvatarSpeech).toHaveBeenCalled();
    expect(fake.stopListening).toHaveBeenCalled();
    await receive('story_check_speech_done', { checkId, seq: 1, ok: true });
    expect(fake.listen).not.toHaveBeenCalled();
    await act(async () => result.current.togglePause());
    expect(lastSent('story_check_resume')).toEqual({ type: 'story_check_resume', checkId });
  });

  it('does not start the story during the pause after the verdict when paused', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const checkId = await finishChapter();
    await receive('story_check_decision', { checkId, seq: 3, decision: 'NEXT', attempt: 0, nextAttempt: 0, speechKo: '잘했어.' });
    await receive('story_check_speech_done', { checkId, seq: 3, ok: true });
    await act(async () => result.current.togglePause());
    await act(async () => { vi.advanceTimersByTime(DECISION_PAUSE_MS * 2); });
    expect(result.current).toMatchObject({ phase: 'checking', chapterIndex: 0, paused: true });
    await act(async () => result.current.togglePause());
    expect(result.current).toMatchObject({ phase: 'checking', chapterIndex: 0 });
    expect(result.current.check.status).toBe('passed');
  });

  it('lets a learner who passed choose the next chapter or this one again, and moves on by itself', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const pass = async (seq: number) => {
      const checkId = await finishChapter();
      await receive('story_check_decision', { checkId, seq, decision: 'NEXT', attempt: 0, nextAttempt: 0, speechKo: '잘 이해했어!' });
      await receive('story_check_speech_done', { checkId, seq, ok: true });
      await act(async () => { vi.advanceTimersByTime(DECISION_PAUSE_MS); });
    };
    await pass(3);
    expect(result.current.check.status).toBe('passed');
    expect(result.current.phase).toBe('checking');
    expect(lastSent('story_check_pause')).toBeUndefined();

    // The passed learner picks the help; picking restarts the countdown.
    await act(async () => { vi.advanceTimersByTime(4000); });
    await act(async () => result.current.toggleReview('slow'));
    await act(async () => result.current.toggleReview('korean'));
    expect(result.current.passedLeft).toBe(PASSED_AUTO_NEXT_MS / 1000);
    expect(result.current.reviewChoice).toEqual({ speed: 'slow', english: false, korean: true });
    const starts = send.mock.calls.filter(([message]) => message.type === 'story_check_start').length;
    await act(async () => result.current.listenAgain());
    expect(result.current).toMatchObject({ phase: 'listening', chapterIndex: 0, attempt: 0 });
    expect(result.current.support).toEqual({ speed: 'slow', english: false, korean: true });
    expect(fake.speeds.at(-1)).toBe('slow');

    // The review skips the quiz and comes back to the passed card.
    await act(async () => fake.setPlayer!({ finished: true, playing: false }));
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(send.mock.calls.filter(([message]) => message.type === 'story_check_start')).toHaveLength(starts);
    expect(result.current).toMatchObject({ phase: 'checking', chapterIndex: 0, passedLeft: PASSED_AUTO_NEXT_MS / 1000 });
    expect(result.current.check.status).toBe('passed');
    await act(async () => result.current.goNext());
    expect(result.current).toMatchObject({ phase: 'listening', chapterIndex: 1, attempt: 0 });
    expect(result.current.support).toEqual({ speed: 'normal', english: false, korean: false });

    await pass(5);
    expect(result.current.passedLeft).toBe(PASSED_AUTO_NEXT_MS / 1000);
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(result.current.passedLeft).toBe(PASSED_AUTO_NEXT_MS / 1000 - 3);
    await act(async () => result.current.togglePause());
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(result.current).toMatchObject({ chapterIndex: 1, passedLeft: PASSED_AUTO_NEXT_MS / 1000 - 3 });
    await act(async () => result.current.togglePause());
    await act(async () => { vi.advanceTimersByTime(PASSED_AUTO_NEXT_MS - 3000 - 1000); });
    expect(result.current.chapterIndex).toBe(1);
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(result.current).toMatchObject({ phase: 'listening', chapterIndex: 2 });
  });

  it('replays the current or previous sentence while narrating, resuming from a pause', async () => {
    const { result } = render();
    await act(async () => result.current.pick('odyssey'));
    await act(async () => fake.setPlayer!({ index: 3 }));
    await act(async () => result.current.togglePause());
    expect(result.current.paused).toBe(true);
    await act(async () => result.current.replaySentence(0));
    expect(fake.jumps.at(-1)).toEqual([3, true]);
    expect(result.current.paused).toBe(false);
    await act(async () => result.current.replaySentence(-1));
    expect(fake.jumps.at(-1)).toEqual([2, true]);
  });

  it('moves the narration by two seconds only while it is narrated', async () => {
    const { result } = render();
    await act(async () => result.current.pick('odyssey'));
    await act(async () => result.current.togglePause());
    await act(async () => result.current.seekNarration(-2));
    expect(fake.seekBy).toHaveBeenLastCalledWith(-2);
    expect(result.current.paused).toBe(false);
    await finishChapter();
    await act(async () => result.current.seekNarration(2));
    expect(fake.seekBy).toHaveBeenCalledTimes(1);
  });

  it('pauses and resumes the narration itself while listening', async () => {
    const { result } = render();
    await act(async () => result.current.pick('odyssey'));
    await act(async () => result.current.togglePause());
    expect(fake.pause).toHaveBeenCalled();
    expect(result.current.paused).toBe(true);
    await act(async () => result.current.togglePause());
    expect(fake.play).toHaveBeenCalled();
  });

  it('shows a server failure with a retry that starts a new check for the same attempt', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    const checkId = await finishChapter();
    await receive('story_check_error', { checkId, code: 'failed', content: '확인 질문을 이어가지 못했어요.' });
    expect(result.current.check).toMatchObject({ status: 'error', notice: '확인 질문을 이어가지 못했어요.' });
    await act(async () => result.current.retryCheck());
    const restarted = lastSent('story_check_start')!;
    expect(restarted.checkId).not.toBe(checkId);
    expect(restarted).toMatchObject({ chapterId: 'cottage', attempt: 0 });
  });

  it('ends the server check and narration on shutdown', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    await act(async () => result.current.shutdown());
    expect(lastSent('story_check_end')).toEqual({ type: 'story_check_end' });
    expect(fake.jumps.at(-1)).toEqual([0, false]);
    expect(stopAvatarSpeech).toHaveBeenCalled();
  });
  it('gives up waiting for a server that never sends the first question', async () => {
    const { result } = render();
    await act(async () => result.current.pick('reluctant-dragon'));
    await finishChapter();
    expect(result.current.check.status).toBe('starting');
    await act(async () => { vi.advanceTimersByTime(12_000); });
    expect(result.current.check.status).toBe('error');
    expect(result.current.check.notice).toContain('대답하지 않아요');
  });
  it('narrates the next chapter before asking again, even while the old "finished" lingers', async () => {
    const { result } = render();
    await act(async () => result.current.pick('odyssey'));
    await finishChapter();
    fake.lateReset = true;
    await act(async () => result.current.leaveCheck());
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(result.current).toMatchObject({ phase: 'listening', chapterIndex: 1 });
    await act(async () => { vi.advanceTimersByTime(60); });
    expect(send.mock.calls.filter(([message]) => message.type === 'story_check_start')).toHaveLength(1);
    await finishChapter();
    expect(lastSent('story_check_start')).toMatchObject({ chapterId: 'horse', attempt: 0 });
  });
});
