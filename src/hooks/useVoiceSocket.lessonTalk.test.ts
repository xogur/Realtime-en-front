// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/stores/useStore';
import { useLessonTalkStore } from '@/features/lessonTalk/lessonTalk';
import { TURN } from '@/features/lessonTalk/fixtures';
import { useVoiceSocket } from './useVoiceSocket';

const mocks = vi.hoisted(() => ({ play: vi.fn(), clear: vi.fn() }));
vi.mock('./useSttAdapter', () => ({ useSttAdapter: () => ({
  provider: 'browser', prepare: vi.fn(async () => true), start: vi.fn(async () => true),
  stop: vi.fn(async () => undefined), isRecording: false,
}) }));
vi.mock('./useAudioPlayer', () => ({ useAudioPlayer: () => ({
  playPcmChunk: mocks.play, clearQueue: mocks.clear, muteTts: vi.fn(), unmuteTts: vi.fn(),
}) }));

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => Promise<void>) | null = null;
  constructor() { FakeSocket.instances.push(this); }
  send(data: string) { this.sent.push(data); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  async emit(data: Record<string, unknown>) { await this.onmessage?.({ data: JSON.stringify(data) }); }
}

/** One scripted lesson line (a generation) as the server sends it. */
async function speakLine(socket: FakeSocket, generation: number) {
  const scope = { generation_id: generation, lessonTalkId: TURN.talkId, sessionEpoch: 1, turnId: `1:${generation}` };
  await socket.emit({ type: 'partial_assistant_answer', content: 'line', ...scope });
  await socket.emit({ type: 'tts_chunk', content: 'AAAA', ...scope });
  await socket.emit({ type: 'final_assistant_answer', content: 'line', ...scope });
}
const skipped = (generation: number) => ({
  type: 'turn_evaluation_skipped', turnId: `1:${generation}`, generation_id: generation, reason: 'scripted_replay', sessionEpoch: 1,
});

describe('lesson talk avatar lines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ results: [] }))));
    useStore.setState({ isConnected: false, isRecording: false, isSttReady: false, isPlaying: false, messages: [] });
    useLessonTalkStore.getState().clear();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function controller() {
    const hook = renderHook(() => useVoiceSocket());
    act(() => hook.result.current.connect({ role: 'controller', startRecording: false }));
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    return { ...hook, socket };
  }

  it('plays every line of a mixed Korean/English turn without flushing between lines', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit({ type: 'lesson_talk_turn', ...TURN }));
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    mocks.clear.mockClear();
    await act(async () => speakLine(socket, 7));
    await act(async () => socket.emit({ type: 'lesson_talk_line', talkId: TURN.talkId, seq: TURN.seq, index: 1 }));
    await act(async () => socket.emit(skipped(7)));  // late result for the previous line
    await act(async () => speakLine(socket, 8));
    expect(mocks.play.mock.calls.map(([chunk]) => chunk.generationId)).toEqual(['7', '8']);
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('ignores a line marker from another turn and keeps lesson lines off the chat timeline', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit({ type: 'lesson_talk_turn', ...TURN }));
    await act(async () => speakLine(socket, 7));
    await act(async () => socket.emit({ type: 'lesson_talk_line', talkId: TURN.talkId, seq: 1, index: 1 }));
    await act(async () => speakLine(socket, 8));
    expect(mocks.play.mock.calls.map(([chunk]) => chunk.generationId)).toEqual(['7']);
    expect(useStore.getState().messages).toEqual([]);
  });

  it('sends only lesson_talk_* messages', async () => {
    const { result, socket } = await controller();
    expect(result.current.sendLessonTalk({ type: 'lesson_talk_listen', talkId: TURN.talkId, seq: 3 })).toBe(true);
    expect(result.current.sendLessonTalk({ type: 'story_check_start' })).toBe(false);
    expect(socket.sent.map((raw) => JSON.parse(raw).type)).toContain('lesson_talk_listen');
  });
});
