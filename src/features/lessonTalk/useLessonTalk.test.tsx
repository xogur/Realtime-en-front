// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStore } from '@/stores/useStore';

import { useLessonTalkStore } from './lessonTalk';
import { TURN } from './fixtures';
import { useLessonTalk } from './useLessonTalk';

const publish = vi.hoisted(() => vi.fn());
vi.mock('./control', () => ({ createLessonViewPublisher: () => ({ publish, close: vi.fn() }) }));

const send = vi.fn((message: Record<string, unknown>) => { void message; return true; });
const stopAvatarSpeech = vi.fn();
const onFinish = vi.fn();
const setMicrophone = vi.fn();

function sent(type: string) {
  return send.mock.calls.map(([message]) => message).filter((message) => message.type === type);
}

async function receive(type: string, data: Record<string, unknown>) {
  await act(async () => { useLessonTalkStore.getState().receive(type, data); });
}

async function setPlaying(isPlaying: boolean) {
  await act(async () => { useStore.setState({ isPlaying }); });
}

function render(isConnected = true) {
  return renderHook(({ connected }) => useLessonTalk({
    kioskId: 'A01', isConnected: connected, sendLessonTalk: send, stopAvatarSpeech, setMicrophone, onFinish,
  }), { initialProps: { connected: isConnected } });
}

async function startWithTurn(turn: Record<string, unknown> = TURN) {
  const hook = render();
  await act(async () => hook.result.current.start());
  const talkId = sent('lesson_talk_start')[0].talkId as string;
  await receive('lesson_talk_turn', { ...turn, talkId });
  return { hook, talkId };
}

describe('useLessonTalk', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    send.mockClear(); stopAvatarSpeech.mockClear(); onFinish.mockClear(); setMicrophone.mockClear(); publish.mockClear();
    useLessonTalkStore.getState().clear();
    useStore.setState({ isPlaying: false });
  });
  afterEach(() => vi.useRealTimers());

  it('listens only after the avatar finished speaking and its audio drained', async () => {
    const { hook, talkId } = await startWithTurn();
    expect(hook.result.current.status).toBe('speaking');
    await setPlaying(true);
    await receive('lesson_talk_speech_done', { talkId, seq: 3, ok: true });
    expect(sent('lesson_talk_listen')).toEqual([]);
    await setPlaying(false);
    expect(sent('lesson_talk_listen')).toEqual([{ type: 'lesson_talk_listen', talkId, seq: 3 }]);
    expect(hook.result.current.status).toBe('listening');
    expect(setMicrophone).toHaveBeenCalledWith(true);
  });

  it('sends the heard answer once and ignores thinking sounds and other turns', async () => {
    const { hook, talkId } = await startWithTurn();
    await receive('lesson_talk_speech_done', { talkId, seq: 3, ok: true });
    await receive('lesson_talk_partial', { talkId, seq: 3, content: 'Water' });
    expect(hook.result.current.status).toBe('hearing');
    await receive('lesson_talk_heard', { talkId, seq: 3, content: 'um' });
    expect(sent('lesson_talk_answer')).toEqual([]);
    expect(sent('lesson_talk_listen')).toHaveLength(2);  // listens again for the real answer
    await receive('lesson_talk_heard', { talkId, seq: 2, content: 'old answer' });
    await receive('lesson_talk_heard', { talkId, seq: 3, content: 'Water, please.' });
    await receive('lesson_talk_heard', { talkId, seq: 3, content: 'Water, please.' });
    expect(sent('lesson_talk_answer')).toEqual([{ type: 'lesson_talk_answer', talkId, seq: 3, kind: 'speech', text: 'Water, please.' }]);
    expect(hook.result.current.status).toBe('thinking');
    expect(hook.result.current.answered).toBe('Water, please.');
  });

  it('sends silence after the wait time, help and touch on request', async () => {
    const { hook, talkId } = await startWithTurn();
    await receive('lesson_talk_speech_done', { talkId, seq: 3, ok: true });
    await act(async () => { vi.advanceTimersByTime(8_999); });
    expect(sent('lesson_talk_answer')).toEqual([]);
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(sent('lesson_talk_answer')[0]).toMatchObject({ seq: 3, kind: 'silence' });
    await receive('lesson_talk_turn', { ...TURN, talkId, seq: 4 });
    await receive('lesson_talk_speech_done', { talkId, seq: 4, ok: true });
    await act(async () => hook.result.current.help());
    expect(sent('lesson_talk_answer')[1]).toMatchObject({ seq: 4, kind: 'help' });
    await receive('lesson_talk_turn', { ...TURN, talkId, seq: 5, expect: { kind: 'choice', listenLang: 'en', choices: [{ id: 'tea', label: 'Can I have tea, please?' }] } });
    await receive('lesson_talk_speech_done', { talkId, seq: 5, ok: true });
    await act(async () => hook.result.current.choose('tea'));
    expect(sent('lesson_talk_answer')[2]).toMatchObject({ seq: 5, kind: 'touch', choiceId: 'tea' });
  });

  it('continues without speech_done once the audio is quiet past the fallback', async () => {
    const { talkId } = await startWithTurn();
    await setPlaying(true);
    await setPlaying(false);
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(sent('lesson_talk_listen')).toEqual([]);  // the audio played: wait for the server
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(sent('lesson_talk_listen')).toEqual([{ type: 'lesson_talk_listen', talkId, seq: 3 }]);
  });

  it('moves on soon when a turn never makes a sound', async () => {
    const { talkId } = await startWithTurn();
    await act(async () => { vi.advanceTimersByTime(9_000); });
    expect(sent('lesson_talk_listen')).toEqual([]);
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(sent('lesson_talk_listen')).toEqual([{ type: 'lesson_talk_listen', talkId, seq: 3 }]);
  });

  it('restarts a talk the server lost at the same level and topic, once a minute', async () => {
    // Live bug: the server had ended the talk and the avatar sat on its first line until a retry.
    const { hook, talkId } = await startWithTurn();
    await receive('lesson_talk_error', { talkId: 'some-other-talk', code: 'stale_talk', content: '지난 학습이에요.' });
    expect(sent('lesson_talk_start')).toHaveLength(1);
    await receive('lesson_talk_error', { talkId, code: 'stale_talk', content: '지난 학습이에요.' });
    const restarted = sent('lesson_talk_start');
    expect(restarted).toHaveLength(2);
    expect(restarted[1]).toMatchObject({ level: 'beginner', topicId: 'daily' });
    expect(hook.result.current.status).toBe('starting');
    const second = restarted[1].talkId as string;
    await receive('lesson_talk_turn', { ...TURN, talkId: second });
    await receive('lesson_talk_error', { talkId: second, code: 'stale_talk', content: '지난 학습이에요.' });
    expect(sent('lesson_talk_start')).toHaveLength(2);  // not again within a minute: the learner retries
    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.notice).toBe('AI 선생님과 연결이 끊겼어요. 다시 시도해 주세요.');
  });

  it('starts the lesson again after the connection comes back', async () => {
    const hook = render();
    await act(async () => hook.result.current.start({ level: 'beginner', topicId: 'daily' }));
    const talkId = sent('lesson_talk_start')[0].talkId as string;
    await receive('lesson_talk_turn', { ...TURN, talkId });
    hook.rerender({ connected: false });
    expect(hook.result.current.status).toBe('error');
    expect(sent('lesson_talk_start')).toHaveLength(1);
    hook.rerender({ connected: true });
    expect(sent('lesson_talk_start')).toHaveLength(2);
    expect(sent('lesson_talk_start')[1]).toMatchObject({ level: 'beginner', topicId: 'daily' });
    expect(hook.result.current.status).toBe('starting');
  });

  it('a paused talk is restarted on resume, not on reconnect', async () => {
    const { hook, talkId } = await startWithTurn();
    await act(async () => hook.result.current.togglePause());
    hook.rerender({ connected: false });
    hook.rerender({ connected: true });
    expect(sent('lesson_talk_start')).toHaveLength(1);
    await act(async () => hook.result.current.togglePause());
    await receive('lesson_talk_error', { talkId, code: 'stale_talk', content: '지난 학습이에요.' });
    expect(sent('lesson_talk_start')).toHaveLength(2);
  });

  it('pauses and resumes through the server and stops the avatar line', async () => {
    const { hook, talkId } = await startWithTurn();
    await act(async () => hook.result.current.togglePause());
    expect(stopAvatarSpeech).toHaveBeenCalled();
    expect(sent('lesson_talk_pause')).toEqual([{ type: 'lesson_talk_pause', talkId }]);
    await receive('lesson_talk_speech_done', { talkId, seq: 3, ok: true });
    expect(sent('lesson_talk_listen')).toEqual([]);  // paused: never listens
    await act(async () => hook.result.current.togglePause());
    expect(sent('lesson_talk_resume')).toEqual([{ type: 'lesson_talk_resume', talkId }]);
  });

  it('finishes into free talk or back to the mode choice after the closing line', async () => {
    const { talkId } = await startWithTurn();
    await receive('lesson_talk_end', { ...TURN, talkId, seq: 9, stage: 'end', expect: { kind: 'none', listenLang: 'en' },
      next: 'FREE_TALK', freeTalk: { topicId: 'daily', difficultyId: 'beginner' } });
    expect(onFinish).not.toHaveBeenCalled();
    await receive('lesson_talk_speech_done', { talkId, seq: 9, ok: true });
    expect(onFinish).toHaveBeenCalledWith({ kind: 'free_talk', topicId: 'daily', difficultyId: 'beginner' });
    expect(sent('lesson_talk_listen')).toEqual([]);
  });

  it('shows a fatal failure, ignores non-fatal ones and retries with the known lesson', async () => {
    const { hook, talkId } = await startWithTurn();
    await receive('lesson_talk_error', { talkId, code: 'stale_prompt', content: '지난 질문이에요.' });
    expect(hook.result.current.status).toBe('speaking');
    await receive('lesson_talk_error', { talkId, code: 'failed', content: '학습을 이어가지 못했어요.' });
    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.notice).toBe('학습을 이어가지 못했어요.');
    await act(async () => hook.result.current.retry());
    expect(sent('lesson_talk_start')[1]).toMatchObject({ level: 'beginner', topicId: 'daily' });
  });

  it('times out when the server never answers and ends the talk on shutdown', async () => {
    const hook = render();
    await act(async () => hook.result.current.start());
    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(hook.result.current.status).toBe('error');
    await act(async () => hook.result.current.shutdown());
    expect(sent('lesson_talk_end')).toHaveLength(1);
  });

  it('mirrors the lesson view for the guide screen', async () => {
    await startWithTurn();
    expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'lesson', titleKo: '원하는 것 부탁하기', lineEn: 'Hi! What would you like?', turnTotal: 5,
    }));
  });
});
