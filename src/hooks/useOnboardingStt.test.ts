// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStt } from './useOnboardingStt';

const state = vi.hoisted(() => ({ playback: 'idle', nodes: [] as { port: { onmessage: ((event: { data: Float32Array }) => void) | null }; disconnect: () => void }[] }));
vi.mock('./useBrowserTts', () => ({ getBrowserTtsPlaybackState: () => ({ state: state.playback }) }));

const track = { stop: vi.fn(), onended: null };
class Context {
  sampleRate = 16000;
  state = 'running';
  destination = {};
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
}
class Worklet {
  port = { onmessage: null as ((event: { data: Float32Array }) => void) | null };
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() { state.nodes.push(this); }
}
const options = () => ({
  onFinalTranscript: vi.fn(), onInterimTranscript: vi.fn(), onReadyChange: vi.fn(),
  onError: vi.fn(), getPlaybackState: () => ({ isPlaying: false, text: '' }),
});
const frames = (voice = true) => {
  state.nodes.at(-1)?.port.onmessage?.({ data: new Float32Array(4000).fill(voice ? 0.1 : 0) });
  state.nodes.at(-1)?.port.onmessage?.({ data: new Float32Array(18000) });
};

describe('isolated Korean STT capture', () => {
  beforeEach(() => {
    state.playback = 'idle'; state.nodes = [];
    vi.stubGlobal('AudioContext', Context);
    vi.stubGlobal('AudioWorkletNode', Worklet);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })),
    } });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ text: '초급' }) })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('sends final PCM to Korean endpoint, not the conversation socket', async () => {
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { expect(await result.current.startAndWaitUntilReady()).toBe(true); });
    await act(async () => { frames(); });
    expect(fetch).toHaveBeenCalledWith('/api/onboarding-stt?language=ko', expect.objectContaining({ method: 'POST' }));
    expect(callbacks.onFinalTranscript).toHaveBeenCalledExactlyOnceWith({ text: '초급' });
    expect(callbacks.onInterimTranscript).not.toHaveBeenCalled();
    unmount();
  });

  it('names the Korean step of each utterance so the server can give Crisper its question', async () => {
    let step: 'difficulty' | null = 'difficulty';
    const callbacks = { ...options(), hint: () => step };
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    expect(fetch).toHaveBeenLastCalledWith('/api/onboarding-stt?language=ko&hint=difficulty', expect.anything());
    step = null;
    await act(async () => { frames(); });
    expect(fetch).toHaveBeenLastCalledWith('/api/onboarding-stt?language=ko', expect.anything());
    unmount();
  });

  it('never sends a Korean step hint with English audio', async () => {
    const callbacks = { ...options(), language: 'en' as const, hint: () => 'name' as const };
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    expect(fetch).toHaveBeenCalledWith('/api/onboarding-stt?language=en', expect.anything());
    unmount();
  });

  it('sends English replies to the English endpoint of the same server', async () => {
    const callbacks = { ...options(), language: 'en' as const };
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    expect(fetch).toHaveBeenCalledWith('/api/onboarding-stt?language=en', expect.anything());
    unmount();
  });

  it('retries an empty result once before reporting it, and keeps listening', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text: ' ' }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text: '이야기 듣기' }) } as Response);
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(callbacks.onFinalTranscript).toHaveBeenCalledExactlyOnceWith({ text: '이야기 듣기' });
    expect(callbacks.onError).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: '' }) } as Response);
    await act(async () => { frames(); });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith('STT_NO_RESULT');
    expect(result.current.status).toBe('listening');
    unmount();
  });

  it('waits and retries once when the shared STT server is busy', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response);
      const callbacks = options();
      const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
      await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
      expect(fetch).toHaveBeenCalledOnce();
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith('STT_BUSY');
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('never retries after stop()', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429 } as Response);
      const callbacks = options();
      const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
      await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
      await act(async () => { await result.current.stop(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(fetch).toHaveBeenCalledOnce();
      expect(callbacks.onError).not.toHaveBeenCalled();
      unmount();
    } finally { vi.useRealTimers(); }
  });

  it('hands the open microphone over without stopping it', async () => {
    track.stop.mockClear();
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); });
    let stream: MediaStream | null = null;
    await act(async () => { stream = await result.current.takeAudioInput(); });
    expect(stream).not.toBeNull();
    expect(track.stop).not.toHaveBeenCalled();
    expect(state.nodes.at(-1)?.port.onmessage).toBeNull();
    expect(result.current.status).toBe('idle');
    await act(async () => { await result.current.stop(); });
    expect(track.stop).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.takeAudioInput()).toBeNull(); });
    unmount();
  });

  it('discards queued prompts, speaker playback and their echo tail', async () => {
    const { result, unmount } = renderHook(() => useOnboardingStt(options()));
    let time = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => time);
    await act(async () => { await result.current.startAndWaitUntilReady(); });
    for (const playback of ['queued', 'speaking']) {
      state.playback = playback;
      await act(async () => { frames(); });
    }
    state.playback = 'idle';
    await act(async () => { frames(); });
    expect(fetch).not.toHaveBeenCalled();
    time += 400;
    await act(async () => { frames(); });
    expect(fetch).toHaveBeenCalledOnce();
    unmount();
  });

  it('ignores a late transcription after stop and aborts the request', async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await act(async () => { await result.current.stop(); });
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolve({ ok: true, json: async () => ({ text: 'old name' }) } as Response); });
    expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();
    unmount();
  });

  it('captures a user during TTS when barge-in is enabled, but rejects prompt echo', async () => {
    const callbacks = { ...options(), allowDuringPlayback: true,
      getPlaybackState: () => ({ isPlaying: true, text: '김민수님인가요?' }) };
    state.playback = 'speaking';
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); });
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ text: '김민수님인가요?' }) } as Response);
    await act(async () => { frames(); });
    expect(fetch).toHaveBeenCalledOnce();
    expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ text: '아니요, 김민서예요' }) } as Response);
    await act(async () => { frames(); });
    expect(callbacks.onFinalTranscript).toHaveBeenCalledExactlyOnceWith({ text: '아니요, 김민서예요' });
    unmount();
  });

  it('reports a server failure without selecting anything', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    expect(callbacks.onError).toHaveBeenCalledWith('STT_UNAVAILABLE');
    expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();
    unmount();
  });

  it.each(['김민수', '김민수님인가요?'])('rejects delayed echo %s after the prompt has ended', async (text) => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((done) => { resolve = done; }));
    let speaking = true;
    const callbacks = { ...options(), allowDuringPlayback: true,
      getPlaybackState: () => ({ isPlaying: speaking, text: '김민수님인가요?' }) };
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    speaking = false;
    await act(async () => { resolve({ ok: true, json: async () => ({ text }) } as Response); });
    expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();
    expect(result.current.status).toBe('listening');
    unmount();
  });

  it('still ignores silence and asks the browser for echo cancellation in barge-in mode', async () => {
    const { result, unmount } = renderHook(() => useOnboardingStt({ ...options(), allowDuringPlayback: true }));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(false); });
    expect(fetch).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: {
      channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } });
    unmount();
  });

  it('keeps the microphone open across a re-prompt and only stops listening', async () => {
    track.stop.mockClear();
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); });
    await act(async () => { await result.current.pause(); });
    expect(track.stop).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    // Speech while paused is never sent.
    await act(async () => { frames(); });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => { await result.current.stop(); });
    expect(track.stop).toHaveBeenCalledOnce();
    unmount();
  });

  it('keeps the first syllable spoken just before listening starts', async () => {
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.prepare(); });
    const node = state.nodes.at(-1)!;
    await act(async () => { node.port.onmessage?.({ data: new Float32Array(1600).fill(0.1) }); });
    await act(async () => {
      await result.current.startAndWaitUntilReady();
      node.port.onmessage?.({ data: new Float32Array(4000).fill(0.1) });
      node.port.onmessage?.({ data: new Float32Array(18000) });
    });
    const body = vi.mocked(fetch).mock.calls[0][1]?.body as ArrayBuffer;
    expect(body.byteLength / 2).toBe(1600 + 4000 + 18000);
    unmount();
  });

  it('drops a transcript requested before a re-prompt', async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const callbacks = options();
    const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
    await act(async () => { await result.current.startAndWaitUntilReady(); frames(); });
    await act(async () => { await result.current.pause(); await result.current.startAndWaitUntilReady(); });
    await act(async () => { resolve({ ok: true, json: async () => ({ text: '지난 답' }) } as Response); });
    expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();
    expect(result.current.status).toBe('listening');
    unmount();
  });

  it('asks for a touch instead of waiting forever when Chrome keeps audio suspended', async () => {
    vi.useFakeTimers();
    try {
      track.stop.mockClear();
      class Suspended extends Context {
        state = 'suspended';
        resume = vi.fn(() => new Promise<undefined>(() => undefined));
      }
      vi.stubGlobal('AudioContext', Suspended);
      const callbacks = options();
      const { result, unmount } = renderHook(() => useOnboardingStt(callbacks));
      let prepared: Promise<boolean> | undefined;
      act(() => { prepared = result.current.prepare(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
      await expect(prepared).resolves.toBe(false);
      expect(callbacks.onError).toHaveBeenCalledWith('AUDIO_GESTURE_REQUIRED');
      expect(track.stop).toHaveBeenCalled();
      unmount();
    } finally { vi.useRealTimers(); }
  });
});
