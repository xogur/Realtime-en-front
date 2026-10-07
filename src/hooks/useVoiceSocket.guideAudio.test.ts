// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/stores/useStore';
import { useMissionLearningStore } from '@/features/missionLearning/store';
import type { MissionSnapshot } from '@/features/missionLearning/types';
import type { useSttAdapter } from './useSttAdapter';
import { useVoiceSocket } from './useVoiceSocket';
import { MISSION_GUIDE_AUDIO_RELEASE_EVENT } from '@/features/missionLearning/useMissionGuideAudio';
import { useGuidedLearningStore } from '@/features/missionLearning/guided/store';
import { guidedFixture } from '@/features/missionLearning/guided/fixtures';
import { useGuidedLessonVoice } from '@/features/missionLearning/guided/useGuidedLessonVoice';

const mocks = vi.hoisted(() => ({
  options: null as Parameters<typeof useSttAdapter>[0] | null,
  start: vi.fn(async () => true), stop: vi.fn(async (): Promise<void> => undefined),
  play: vi.fn(), clear: vi.fn(), mute: vi.fn(), unmute: vi.fn(),
  idle: undefined as (() => void) | undefined,
}));
vi.mock('./useSttAdapter', () => ({ useSttAdapter: (options: Parameters<typeof useSttAdapter>[0]) => {
  mocks.options = options;
  return { provider: 'browser', start: mocks.start, stop: mocks.stop, isRecording: useStore((state) => state.isRecording) };
} }));
vi.mock('./useAudioPlayer', () => ({ useAudioPlayer: (options: { onPlaybackIdle?: () => void }) => { mocks.idle = options.onPlaybackIdle; return ({
  playPcmChunk: mocks.play, clearQueue: mocks.clear, muteTts: mocks.mute, unmuteTts: mocks.unmute,
}); } }));

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
  it('treats a recorder start interrupted by ROLE acquisition as superseded without closing the server lease', async () => {
    const { socket, result } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    let finishStart!: (ready: boolean) => void;
    mocks.start.mockImplementationOnce(() => new Promise(resolve => { finishStart = resolve; }));
    await act(async () => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    const sentBeforeGate = socket.sent.length;
    await act(async () => socket.emit({ ...guideEvent(true, 'role-start-race'), sessionId: 'guided-one', captureEpoch: 2 }));
    await act(async () => finishStart(false));
    const afterGate = socket.sent.slice(sentBeforeGate).map(v => typeof v === 'string' ? JSON.parse(v) : null);
    expect(afterGate.filter(v => v?.type === 'stt_capture_state')).toEqual([]);
    expect(afterGate.filter(v => v?.type === 'guided_capture_status' && v.status === 'ERROR')).toEqual([]);
    await act(async () => socket.emit({ ...guideEvent(false, 'role-start-race'), sessionId: 'guided-one', captureEpoch: 4, captureActive: false }));
    await act(async () => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    expect(mocks.start).toHaveBeenCalledTimes(3);
  });
  it.each([false, undefined])('fails the same ROLE token when synthesis success is %s', async synthesisSucceeded => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true, 'role-fail'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-fail' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', playbackId: 'role-fail', generationComplete: true, synthesisSucceeded }));
    expect(socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null)).toContainEqual({ type: 'guided_role_audio_complete', playbackId: 'role-fail', success: false });
  });
  it('sends capture cancellation with the original speech-start ticket', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    act(() => mocks.options?.onSpeechStarted());
    act(() => mocks.options?.onUtteranceAborted?.('NO_FINAL'));
    const messages = socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null);
    const start = messages.find(v => v?.type === 'guided_capture_start');
    expect(start).toBeDefined();
    expect(messages).toContainEqual({ ...start, type: 'guided_capture_cancel', reason: 'NO_FINAL' });
  });
  it('consumes a prepared handoff only on controller and releases quarantine only for its request ID', async () => {
    const { socket } = await controller();
    const handoff = { id: 'grant-one', expiresAt: '2026-10-01T00:00:00Z', topicId: 'daily', openerId: 'request', difficultyId: 'beginner', status: 'PREPARED' as const };
    await act(async () => socket.emit(guidedFixture({ stage: 'SUMMARY', guided: { ...guidedFixture().guided!, phase: 'RECAP' }, handoff, revision: 3 })));
    expect(socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null)).toContainEqual({ type: 'consume_guided_handoff', sessionId: 'guided-one', handoffId: 'grant-one' });
    await act(async () => socket.emit({ type: 'conversation_started', requestId: 'wrong' }));
    expect(useGuidedLearningStore.getState().snapshot).not.toBeNull();
    await act(async () => socket.emit({ type: 'conversation_started', requestId: 'grant-one' }));
    expect(useGuidedLearningStore.getState().snapshot).toBeNull();
    await act(async () => socket.emit(guidedFixture({ stage: 'COMPLETED', guided: null, handoff: { ...handoff, status: 'COMPLETE' }, revision: 4 })));
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 100, content: 'opening' }));
    expect(mocks.play).toHaveBeenCalledOnce();
  });
  it.each([false, true])('rearms handoff microphone only after its first ACK, respecting manual stop %s', async manualStop => {
    const { socket, result } = await controller();
    const handoff = { id: 'mic-grant', expiresAt: '2026-10-01T00:00:00Z', topicId: 'daily', openerId: 'request', difficultyId: 'beginner', status: 'PREPARED' as const };
    await act(async () => socket.emit(guidedFixture()));
    if (manualStop) act(() => result.current.stopListening());
    else await act(async () => { result.current.syncGuidedCapture(false, 'guided-one', 'attempt-one'); });
    await act(async () => socket.emit(guidedFixture({ stage: 'SUMMARY', guided: { ...guidedFixture().guided!, phase: 'RECAP' }, handoff, revision: 3 })));
    mocks.start.mockClear();
    await act(async () => socket.emit({ type: 'conversation_started', requestId: 'wrong-grant' }));
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => socket.emit({ type: 'conversation_started', requestId: 'mic-grant' }));
    expect(mocks.start).toHaveBeenCalledTimes(manualStop ? 0 : 1);
    await act(async () => socket.emit({ type: 'conversation_started', requestId: 'mic-grant' }));
    expect(mocks.start).toHaveBeenCalledTimes(manualStop ? 0 : 1);
  });
  it('retires a failed handoff request so later explicit free talk can start', async () => {
    const { socket, result } = await controller();
    const handoff = { id: 'failed-grant', expiresAt: '2026-10-01T00:00:00Z', topicId: 'daily', openerId: 'request', difficultyId: 'beginner', status: 'PREPARED' as const };
    await act(async () => socket.emit(guidedFixture({ stage: 'SUMMARY', guided: { ...guidedFixture().guided!, phase: 'RECAP' }, handoff, revision: 3 })));
    await act(async () => socket.emit(guidedFixture({ stage: 'SUMMARY', guided: { ...guidedFixture().guided!, phase: 'RECAP' }, handoff: { ...handoff, status: 'FAILED' }, revision: 4 })));
    await act(async () => socket.emit(guidedFixture({ stage: 'COMPLETED', guided: null, handoff: null, revision: 5 })));
    act(() => result.current.startConversation('airport', 'beginner'));
    await act(async () => socket.emit({ type: 'conversation_started', requestId: 'new-explicit-request' }));
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 111, content: 'free opening' }));
    expect(mocks.play).toHaveBeenCalledOnce();
  });
  it('waits for the exact server release acknowledgement instead of socket send', async () => {
    const { result } = renderHook(() => useVoiceSocket());
    act(() => result.current.connect({ role: 'viewer', startRecording: false }));
    const socket = FakeSocket.instances[0]; await act(async () => socket.open());
    let settled = false;
    const release = result.current.setMissionGuideAudio(false, 'guided-one', 'lease-release', false).then(v => { settled = true; return v; });
    await act(async () => undefined);
    expect(settled).toBe(false);
    await act(async () => socket.emit({ type: 'mission_guide_audio_released', sessionId: 'guided-one', playbackId: 'other', accepted: true }));
    expect(settled).toBe(false);
    await act(async () => socket.emit({ type: 'mission_guide_audio_released', sessionId: 'guided-one', playbackId: 'lease-release', accepted: true }));
    await expect(release).resolves.toBe(true);
  });
  it('tracks viewer ROLE scope and sends scoped cancellation while waiting for its exact acknowledgement', async () => {
    const { result } = renderHook(() => useVoiceSocket());
    act(() => result.current.connect({ role: 'viewer', startRecording: false }));
    const socket = FakeSocket.instances[0]; await act(async () => socket.open());
    await act(async () => socket.emit(guidedFixture()));
    const role = { sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'server-role' };
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, ...role }));
    expect(useGuidedLearningStore.getState().roleAudio).toEqual(role);
    let settled = false;
    const pending = result.current.setMissionGuideAudio(false, role.sessionId, role.playbackId, false,
      { nodeId: role.nodeId, attemptId: role.attemptId }).then(v => { settled = true; return v; });
    expect(socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null)).toContainEqual({
      type: 'mission_guide_audio', active: false, ...role, playbackSucceeded: false, cancelRole: true,
    });
    await act(async () => socket.emit({ type: 'guided_role_audio', active: false, ...role }));
    expect(useGuidedLearningStore.getState().roleAudio).toBeNull();
    expect(settled).toBe(false); // Broadcast is not proof of the reset/abort barrier.
    await act(async () => socket.emit({ type: 'mission_guide_audio_released', sessionId: 'other', playbackId: role.playbackId, accepted: true }));
    expect(settled).toBe(false);
    await act(async () => socket.emit({ type: 'mission_guide_audio_released', sessionId: role.sessionId, playbackId: role.playbackId, accepted: true }));
    await expect(pending).resolves.toBe(true);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    useStore.setState({ isConnected: false, isRecording: false, isSttReady: false, isPlaying: false, liveTranscript: '' });
    useMissionLearningStore.setState({ snapshot: mission, entry: null });
    useGuidedLearningStore.setState({ snapshot: null, error: null, retiredSessions: [], voiceAck: null, partialTranscript: '', captureStatus: null, roleAudio: null });
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

  it('routes v2 only to guided store and binds browser final to speech-start attempt', async () => {
    const { socket } = await controller();
    const s = guidedFixture();
    await act(async () => socket.emit(s));
    expect(useMissionLearningStore.getState().snapshot).toEqual(mission);
    act(() => mocks.options?.onSpeechStarted());
    const start = socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null).find(v => v?.type === 'guided_capture_start');
    expect(start).toMatchObject({ guidedSessionId: s.sessionId, nodeId: 'r1', attemptId: 'attempt-one', controllerEpoch: 2 });
    await act(async () => socket.emit({ ...s, revision: 3, guided: { ...s.guided, inputState: 'PROCESSING' } }));
    act(() => mocks.options?.onFinalTranscript({ text: 'Water, please.', speechEvidence: { version: 1, provider: 'browser', finalSegments: ['Water, please.'] } }));
    const final = socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null).find(v => v?.type === 'user_text_message');
    expect(final).toMatchObject({ guidedSessionId: s.sessionId, nodeId: 'r1', attemptId: 'attempt-one', captureEpoch: start.captureEpoch });
  });

  it('rejects late final after a node change and rejects v2 PREP leakage during guide playback', async () => {
    const { socket } = await controller();
    const s = guidedFixture();
    await act(async () => socket.emit(s));
    act(() => mocks.options?.onSpeechStarted());
    await act(async () => socket.emit({ ...s, revision: 3, guided: { ...s.guided, attemptId: 'new-attempt', nodeId: 'g1' } }));
    act(() => mocks.options?.onFinalTranscript({ text: 'late', speechEvidence: { version: 1, provider: 'browser', finalSegments: ['late'] } }));
    expect(socket.sent.filter(v => typeof v === 'string' && v.includes('user_text_message'))).toHaveLength(0);
    await act(async () => socket.emit({ ...guideEvent(true), sessionId: s.sessionId }));
    const count = socket.sent.length;
    act(() => { mocks.options?.onAudioData(new Int16Array([1])); mocks.options?.onSpeechStarted(); });
    expect(socket.sent.length).toBe(count);
  });

  it('allows only matching ROLE playback through its gate and requires stream-end plus audio drain', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true), sessionId: 'guided-one', playbackId: 'role-one' }));
    await act(async () => socket.emit({ type: 'tts_chunk', content: 'audio' }));
    expect(mocks.play).not.toHaveBeenCalled();
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, playbackId: 'role-one', sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one' }));
    await act(async () => socket.emit({ type: 'tts_chunk', content: 'audio', guidedSessionId: 'guided-one', guidedNodeId: 'r1', guidedAttemptId: 'attempt-one', guidedPlaybackId: 'role-one' }));
    expect(mocks.play).toHaveBeenCalledOnce();
    const completed = () => socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null).filter(v => v?.type === 'guided_role_audio_complete');
    act(() => mocks.idle?.());
    expect(completed()).toHaveLength(0);
    act(() => useStore.setState({ isPlaying: true }));
    await act(async () => socket.emit({ type: 'guided_role_audio', playbackId: 'role-one', generationComplete: true, synthesisSucceeded: true }));
    expect(completed()).toHaveLength(0);
    act(() => { useStore.setState({ isPlaying: false }); mocks.idle?.(); });
    expect(completed()).toEqual([{ type: 'guided_role_audio_complete', playbackId: 'role-one', success: true }]);
  });

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

  it('reopens capture on explicit guided retry after manual stop, then respects another Stop', async () => {
    const { result, socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    act(() => result.current.stopListening());
    await waitFor(() => expect(useStore.getState().isRecording).toBe(false));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'retry-two', true));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
    act(() => result.current.stopListening());
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'retry-two', true));
    await act(async () => undefined);
    expect(mocks.start).toHaveBeenCalledTimes(3);
  });

  it('reports a failed guided mic start and can recover on the same attempt', async () => {
    const { result, socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    mocks.start.mockResolvedValueOnce(false);
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    await act(async () => undefined);
    expect(socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null)).toContainEqual(expect.objectContaining({ type: 'guided_capture_status', status: 'ERROR' }));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
  });

  it('drops free-talk and stale-attempt PCM while guided, and plays only the scoped role lease', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 91, content: 'old-free-talk' }));
    expect(mocks.play).not.toHaveBeenCalled();
    await act(async () => socket.emit({ ...guideEvent(true, 'role-now'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-now' }));
    const chunk = { type: 'tts_chunk', generation_id: 92, content: 'scoped', guidedSessionId: 'guided-one', guidedNodeId: 'r1', guidedAttemptId: 'attempt-one', guidedPlaybackId: 'role-now' };
    await act(async () => socket.emit({ ...chunk, guidedAttemptId: 'old-attempt' }));
    expect(mocks.play).not.toHaveBeenCalled();
    await act(async () => socket.emit(chunk));
    expect(mocks.play).toHaveBeenCalledOnce();
  });

  it('receives scoped live recognition and actual controller microphone status in the viewer', async () => {
    const { result } = renderHook(() => useVoiceSocket());
    act(() => result.current.connect({ role: 'viewer', startRecording: false }));
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    await act(async () => socket.emit(guidedFixture()));
    const context = { sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', controllerEpoch: 2, captureEpoch: 4 };
    await act(async () => socket.emit({ type: 'guided_partial_transcript', ...context, content: 'Can I have water' }));
    expect(useGuidedLearningStore.getState().partialTranscript).toBe('Can I have water');
    await act(async () => socket.emit({ type: 'guided_capture_status', ...context, status: 'LISTENING' }));
    expect(useGuidedLearningStore.getState().captureStatus?.status).toBe('LISTENING');
    expect(useStore.getState().isRecording).toBe(false);
    await act(async () => socket.emit({ type: 'guided_partial_transcript', ...context, attemptId: 'old-attempt', content: 'stale' }));
    expect(useGuidedLearningStore.getState().partialTranscript).toBe('Can I have water');
  });

  it('recovers after a failed role-lease microphone resume instead of retaining active=true', async () => {
    const { result, socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    await act(async () => socket.emit({ ...guideEvent(true), sessionId: 'guided-one' }));
    mocks.start.mockResolvedValueOnce(false);
    await act(async () => socket.emit({ ...guideEvent(false), sessionId: 'guided-one' }));
    expect(mocks.start).toHaveBeenCalledTimes(3);
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(4));
  });

  it('keeps an explicitly restarted guided mic active across the next snapshot', async () => {
    const { result, socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    act(() => result.current.stopListening());
    await act(async () => undefined);
    act(() => result.current.startListening());
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await act(async () => undefined);
    expect(mocks.start).toHaveBeenCalledTimes(3);
  });

  it('does not publish an old Stop completion as the new attempt microphone state', async () => {
    const { result, socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    let releaseStop!: () => void;
    mocks.stop.mockImplementationOnce(() => new Promise<void>(done => { releaseStop = done; }));
    act(() => result.current.stopListening());
    const next = guidedFixture({ revision: 3 }); next.guided!.attemptId = 'retry-two';
    await act(async () => socket.emit(next));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'retry-two', true));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
    const count = socket.sent.length;
    await act(async () => releaseStop());
    expect(socket.sent.slice(count).map(v => typeof v === 'string' ? JSON.parse(v) : null)).not.toContainEqual(expect.objectContaining({ type: 'guided_capture_status', status: 'STOPPED', attemptId: 'retry-two' }));
  });

  it('enqueues voice binding before capture close so its expected revision remains valid', async () => {
    const { result } = renderHook(() => {
      const voice = useVoiceSocket();
      useGuidedLessonVoice({ enabled: true, connected: voice.isConnected, startVoice: voice.startGuidedLearningVoice, syncCapture: voice.syncGuidedCapture });
      return voice;
    });
    act(() => result.current.connect({ startRecording: false }));
    const socket = FakeSocket.instances[0];
    await act(async () => socket.open());
    await act(async () => socket.emit(guidedFixture()));
    const messages = socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null);
    const bind = messages.findIndex(v => v?.type === 'start_guided_learning_voice');
    const close = messages.findIndex(v => v?.type === 'stt_capture_state' && v.active === false);
    expect(bind).toBeGreaterThanOrEqual(0);
    expect(close).toBeGreaterThan(bind);
  });

  it('does not start a second microphone operation on rapid guided mic-on clicks', async () => {
    const { result, socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    act(() => result.current.syncGuidedCapture(true, 'guided-one', 'attempt-one'));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    act(() => result.current.stopListening());
    await act(async () => undefined);
    let started!: () => void;
    mocks.start.mockImplementationOnce(() => new Promise<boolean>(done => { started = () => done(true); }));
    act(() => { result.current.startListening(); result.current.startListening(); });
    expect(mocks.start).toHaveBeenCalledTimes(3);
    await act(async () => started());
  });

  it('flushes already queued role audio immediately when a newer attempt arrives', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true, 'role-now'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-now' }));
    mocks.clear.mockClear();
    const next = guidedFixture({ revision: 3 }); next.guided!.attemptId = 'retry-two';
    await act(async () => socket.emit(next));
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(socket.sent.map(v => typeof v === 'string' ? JSON.parse(v) : null)).toContainEqual({ type: 'guided_role_audio_complete', playbackId: 'role-now', success: false });
  });

  it('discards previous-step audio on a node change even after its ROLE lease was released', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true, 'role-old'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-old' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: false, sessionId: 'guided-one', playbackId: 'role-old' }));
    mocks.clear.mockClear();
    const next = guidedFixture({ revision: 3 }); next.guided!.nodeId = 'g1'; next.guided!.attemptId = 'next-node';
    await act(async () => socket.emit(next));
    expect(mocks.clear).toHaveBeenCalledOnce();
    mocks.clear.mockClear();
    await act(async () => socket.emit({ ...next, revision: 4 }));
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('keeps guided ROLE lines out of the free-talk chat timeline', async () => {
    const { socket } = await controller();
    useStore.setState({ messages: [] });
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true, 'role-now'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-now' }));
    await act(async () => socket.emit({ type: 'final_assistant_answer', generation_id: 7, content: 'Anything else?', guidedSessionId: 'guided-one', guidedNodeId: 'r1', guidedAttemptId: 'attempt-one', guidedPlaybackId: 'role-now' }));
    expect(useStore.getState().messages.map(m => m.content)).not.toContain('Anything else?');
    expect(useStore.getState().partialMessage).toBe('');
  });

  it('cannot bind the guided role generation from late free-talk assistant text', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true, 'role-now'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-now' }));
    await act(async () => socket.emit({ type: 'partial_assistant_answer', generation_id: 91, content: 'late free talk' }));
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 92, content: 'scoped', guidedSessionId: 'guided-one', guidedNodeId: 'r1', guidedAttemptId: 'attempt-one', guidedPlaybackId: 'role-now' }));
    expect(mocks.play).toHaveBeenCalledOnce();
    expect(useStore.getState().partialMessage).not.toBe('late free talk');
  });

  it('cannot bind the guided role generation from a late free-talk user final', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true, 'role-now'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-now' }));
    await act(async () => socket.emit({ type: 'final_user_request', generation_id: 91, content: 'late user' }));
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 92, content: 'scoped', guidedSessionId: 'guided-one', guidedNodeId: 'r1', guidedAttemptId: 'attempt-one', guidedPlaybackId: 'role-now' }));
    expect(mocks.play).toHaveBeenCalledOnce();
  });

  it('drops delayed free-talk stop controls but obeys cancellation of the current role lease', async () => {
    const { socket } = await controller();
    await act(async () => socket.emit(guidedFixture()));
    await act(async () => socket.emit({ ...guideEvent(true, 'role-now'), sessionId: 'guided-one' }));
    await act(async () => socket.emit({ type: 'guided_role_audio', active: true, sessionId: 'guided-one', nodeId: 'r1', attemptId: 'attempt-one', playbackId: 'role-now' }));
    mocks.clear.mockClear();
    await act(async () => socket.emit({ type: 'stop_tts' }));
    expect(mocks.clear).not.toHaveBeenCalled();
    await act(async () => socket.emit({ type: 'stop_tts', guidedSessionId: 'guided-one', guidedNodeId: 'r1', guidedAttemptId: 'attempt-one', guidedPlaybackId: 'role-now' }));
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  it('keeps terminal guided audio quarantined until an explicit free-talk start is acknowledged', async () => {
    const { result, socket } = await controller();
    await act(async () => socket.emit(guidedFixture({ stage: 'COMPLETED', guided: null, revision: 3 })));
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 90, content: 'late' }));
    expect(mocks.play).not.toHaveBeenCalled();
    act(() => result.current.startConversation('airport', 'beginner'));
    await act(async () => undefined);
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 90, content: 'still-late' }));
    expect(mocks.play).not.toHaveBeenCalled();
    await act(async () => socket.emit({ type: 'conversation_started' }));
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 100, content: 'new-free-talk' }));
    expect(mocks.play).toHaveBeenCalledOnce();
    await act(async () => socket.emit({ type: 'tts_chunk', generation_id: 101, content: 'old-role', guidedSessionId: 'guided-one' }));
    expect(mocks.play).toHaveBeenCalledOnce();
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
