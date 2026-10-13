// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/stores/useStore';
import { useStoryCheckStore } from '@/features/storyListening/storyCheck';
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

const CHECK = 'c06b2c47-d9b3-4f8e-924a-73e8e39ebbda';
const prompt = (seq: number) => ({
  type: 'story_check_prompt', checkId: CHECK, seq, attempt: 0, kind: 'question',
  questionKo: '가장 용감한 병사들은 어디에 숨었지?', speechKo: '가장 용감한 병사들은 어디에 숨었지?', index: 0, total: 2,
});
/** One scripted avatar line as the server sends it (story lines have no learner turn). */
async function speakLine(socket: FakeSocket, generation: number) {
  const scope = { generation_id: generation, storyCheckId: CHECK, sessionEpoch: 1, turnId: `1:${generation}` };
  await socket.emit({ type: 'partial_assistant_answer', content: 'line', ...scope });
  await socket.emit({ type: 'tts_chunk', content: 'AAAA', ...scope });
  await socket.emit({ type: 'final_assistant_answer', content: 'line', ...scope });
}
const skipped = (generation: number) => ({
  type: 'turn_evaluation_skipped', turnId: `1:${generation}`, generation_id: generation,
  reason: 'scripted_replay', sessionEpoch: 1,
});
const sentTypes = (socket: FakeSocket) => socket.sent.map((raw) => JSON.parse(raw).type as string);

describe('story check avatar lines', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] })));
    vi.stubGlobal('fetch', fetchMock);
    useStore.setState({ isConnected: false, isRecording: false, isSttReady: false, isPlaying: false });
    useStoryCheckStore.getState().clear();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function controller() {
    const hook = renderHook(() => useVoiceSocket());
    act(() => hook.result.current.connect({ role: 'controller', startRecording: false }));
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    return { ...hook, socket };
  }

  // 2026-10-13 kiosk: a turn-results poll for the previous line (gen 4) landed between
  // story_check_prompt (binding reset) and the next line's first partial, re-bound gen 4,
  // and every gen 5 chunk was dropped: no audio, no tts_start.
  it('plays the next line when a late result for the previous line arrives between prompt and audio', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(prompt(1)));
    await act(async () => speakLine(socket, 4));
    await act(async () => socket.emit(skipped(4)));
    mocks.play.mockClear();
    socket.sent = [];

    await act(async () => socket.emit(prompt(2)));
    await act(async () => socket.emit(skipped(4)));
    await act(async () => speakLine(socket, 5));

    expect(mocks.play).toHaveBeenCalledWith(expect.objectContaining({ generationId: '5' }));
    expect(sentTypes(socket)).toContain('tts_start');
  });

  it('does not poll turn results for story check lines (they have no learner turn to finish)', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(prompt(1)));
    await act(async () => speakLine(socket, 4));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/turn-results'))).toEqual([]);
  });
});
