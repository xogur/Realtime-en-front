// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStt } from './useOnboardingStt';

const state = vi.hoisted(() => ({ playback: 'idle', nodes: [] as { port: { onmessage: ((event: { data: Float32Array }) => void) | null }; disconnect: () => void }[] }));
vi.mock('./useBrowserTts', () => ({ getBrowserTtsPlaybackState: () => ({ state: state.playback }) }));

const track = { stop: vi.fn(), onended: null };
class Context {
  sampleRate = 16000;
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
  state.nodes.at(-1)?.port.onmessage?.({ data: new Float32Array(14000) });
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
    expect(fetch).toHaveBeenCalledWith('/api/onboarding-stt', expect.objectContaining({ method: 'POST' }));
    expect(callbacks.onFinalTranscript).toHaveBeenCalledExactlyOnceWith({ text: '초급' });
    expect(callbacks.onInterimTranscript).not.toHaveBeenCalled();
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
});
