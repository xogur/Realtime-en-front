// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/stores/useStore';
import { useMissionLearningStore } from '@/features/missionLearning/store';
import type { MissionSnapshot } from '@/features/missionLearning/types';
import type { useSttAdapter } from './useSttAdapter';
import { useVoiceSocket } from './useVoiceSocket';
import { MISSION_GUIDE_AUDIO_RELEASE_EVENT } from '@/features/missionLearning/useMissionGuideAudio';

const mocks = vi.hoisted(() => ({
  options: null as Parameters<typeof useSttAdapter>[0] | null,
  start: vi.fn(async () => true), stop: vi.fn(async () => undefined),
  play: vi.fn(), clear: vi.fn(), mute: vi.fn(), unmute: vi.fn(),
}));
vi.mock('./useSttAdapter', () => ({ useSttAdapter: (options: Parameters<typeof useSttAdapter>[0]) => {
  mocks.options = options;
  return { provider: 'browser', start: mocks.start, stop: mocks.stop, isRecording: useStore((state) => state.isRecording) };
} }));
vi.mock('./useAudioPlayer', () => ({ useAudioPlayer: () => ({
  playPcmChunk: mocks.play, clearQueue: mocks.clear, muteTts: mocks.mute, unmuteTts: mocks.unmute,
}) }));

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: Array<string | Uint8Array> = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => Promise<void>) | null = null;
  constructor() { FakeSocket.instances.push(this); }
  send(data: string | Uint8Array) { this.sent.push(data); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  async emit(data: Record<string, unknown>) { await this.onmessage?.({ data: JSON.stringify(data) }); }
}

const mission: MissionSnapshot = {
  type: 'learning_mission_state', sessionId: 'mission-1', kioskId: 'A01', missionId: 'cafe_order',
  variant: 'adult.intro', contentVersion: 'seed', stage: 'ROLEPLAY', revision: 3,
  allowedActions: [], expressions: [], feedback: null, summary: null, endReason: null,
  mission: { titleKo: '', actionKo: '', goalKo: '', situationKo: '', openingLine: '', targetSeconds: 300, goalSlots: [] },
  roleplay: { elapsedSeconds: 0, targetSeconds: 300, hardCapSeconds: 480, remainingSeconds: 300,
    hardCapRemainingSeconds: 480, ended: false, voiceStarted: true },
};

const guideEvent = (active: boolean, playbackId = 'play-1') => ({
  type: 'mission_guide_audio', active, playbackId, sessionId: 'mission-1', captureEpoch: active ? 5 : 6,
  captureActive: !active,
});

describe('mission guide audio WebSocket control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    useStore.setState({ isConnected: false, isRecording: false, isSttReady: false, isPlaying: false, liveTranscript: '' });
    useMissionLearningStore.setState({ snapshot: mission, entry: null });
    mocks.start.mockImplementation(async () => { useStore.getState().setRecording(true); mocks.options?.onReadyChange(true); return true; });
    mocks.stop.mockImplementation(async () => { useStore.getState().setRecording(false); mocks.options?.onReadyChange(false); });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function controller() {
    const hook = renderHook(() => useVoiceSocket());
    act(() => hook.result.current.connect());
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    return { ...hook, socket };
  }

  it('drops PCM, browser transcripts and avatar TTS during the lease, then opens a fresh epoch', async () => {
    const { socket, result } = await controller();
    await act(async () => socket.emit(guideEvent(true)));
    act(() => result.current.startListening());
    expect(mocks.start).toHaveBeenCalledOnce();
    const count = socket.sent.length;
    act(() => {
      mocks.options?.onAudioData(new Int16Array([42]));
      mocks.options?.onFinalTranscript({ text: 'Iced', speechEvidence: { version: 1, provider: 'browser', finalSegments: ['Iced'] } });
      mocks.options?.onInterimTranscript('Iced');
    });
    await act(async () => socket.emit({ type: 'tts_chunk', content: 'ignored' }));
    expect(socket.sent.length).toBe(count);
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(socket.sent.filter((item) => typeof item === 'string' && item.includes('stt_capture_state'))).toHaveLength(1);
    await act(async () => socket.emit(guideEvent(false)));
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(socket.sent).toContain(JSON.stringify({ type: 'stt_capture_state', active: true, capture_session_id: 7 }));
    act(() => mocks.options?.onAudioData(new Int16Array([42])));
    expect(socket.sent[socket.sent.length - 1]).toBeInstanceOf(Uint8Array);
  });

  it('ignores stale release and honors a manual mic stop while paused', async () => {
    const { socket, result } = await controller();
    await act(async () => socket.emit(guideEvent(true)));
    await act(async () => socket.emit(guideEvent(false, 'old-play')));
    expect(mocks.start).toHaveBeenCalledOnce();
    act(() => result.current.stopListening());
    await act(async () => socket.emit(guideEvent(false)));
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it('keeps trailing browser callbacks gated until the local stop has completed', async () => {
    const { socket } = await controller();
    let finishStop!: () => void;
    mocks.stop.mockImplementationOnce(() => {
      mocks.options?.onFinalTranscript({ text: 'Iced', speechEvidence: { version: 1, provider: 'browser', finalSegments: ['Iced'] } });
      return new Promise((resolve) => { finishStop = () => resolve(undefined); });
    });
    await act(async () => socket.emit(guideEvent(true)));
    expect(socket.sent.filter((item) => typeof item === 'string' && item.includes('user_text_message'))).toHaveLength(0);
    let releasing!: Promise<void>;
    act(() => { releasing = socket.emit(guideEvent(false)); });
    const before = socket.sent.length;
    act(() => mocks.options?.onFinalTranscript({ text: 'Iced', speechEvidence: { version: 1, provider: 'browser', finalSegments: ['Iced'] } }));
    expect(socket.sent.length).toBe(before);
    expect(mocks.start).toHaveBeenCalledOnce();
    await act(async () => { finishStop(); await releasing; });
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('does not resume capture after the mission ends', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guideEvent(true)));
    act(() => useMissionLearningStore.getState().pushSnapshot({ ...mission, stage: 'FEEDBACK', revision: 4 }));
    await act(async () => socket.emit({ ...guideEvent(false), captureActive: false }));
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(useStore.getState().isRecording).toBe(false);
  });

  it('resolves only the viewer playback request acknowledged by the server', async () => {
    const { result } = renderHook(() => useVoiceSocket());
    act(() => result.current.connect({ role: 'viewer', startRecording: false }));
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    const request = result.current.setMissionGuideAudio(true, 'mission-1', 'play-1');
    expect(socket.sent).toContain(JSON.stringify({ type: 'mission_guide_audio', active: true, sessionId: 'mission-1', playbackId: 'play-1' }));
    await act(async () => socket.emit({ type: 'mission_guide_audio_ready', playbackId: 'play-1', accepted: true }));
    expect(await request).toBe(true);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('fails a missing ack within ten seconds and releases the lease', async () => {
    const { result } = renderHook(() => useVoiceSocket());
    act(() => result.current.connect({ role: 'viewer', startRecording: false }));
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    vi.useFakeTimers();
    const request = result.current.setMissionGuideAudio(true, 'mission-1', 'play-1');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(await request).toBe(false);
    expect(socket.sent).toContain(JSON.stringify({ type: 'mission_guide_audio', active: false, sessionId: 'mission-1', playbackId: 'play-1' }));
  });

  it('cancels viewer speech on socket loss after acquisition', async () => {
    const released = vi.fn();
    window.addEventListener(MISSION_GUIDE_AUDIO_RELEASE_EVENT, released);
    const { result } = renderHook(() => useVoiceSocket());
    act(() => result.current.connect({ role: 'viewer', startRecording: false }));
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    const request = result.current.setMissionGuideAudio(true, 'mission-1', 'play-1');
    await act(async () => socket.emit({ type: 'mission_guide_audio_ready', playbackId: 'play-1', accepted: true }));
    expect(await request).toBe(true);
    act(() => socket.close());
    expect(released).toHaveBeenCalledOnce();
    expect((released.mock.calls[0][0] as CustomEvent).detail.playbackId).toBe('play-1');
    window.removeEventListener(MISSION_GUIDE_AUDIO_RELEASE_EVENT, released);
  });
});
