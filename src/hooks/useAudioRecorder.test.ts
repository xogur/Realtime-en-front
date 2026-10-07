// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '@/stores/useStore';
import { useAudioRecorder } from './useAudioRecorder';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
class FakeContext {
  static instances: FakeContext[] = [];
  static firstModule: Promise<void> | null = null;
  state = 'running'; destination = {};
  audioWorklet = { addModule: vi.fn(() => FakeContext.instances[0] === this && FakeContext.firstModule ? FakeContext.firstModule : Promise.resolve()) };
  close = vi.fn(async () => { this.state = 'closed'; });
  resume = vi.fn(async () => undefined);
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
  constructor() { FakeContext.instances.push(this); }
}
class FakeWorklet {
  static instances: FakeWorklet[] = [];
  port: { onmessage: ((event: { data: Float32Array }) => void) | null } = { onmessage: null };
  connect = vi.fn(); disconnect = vi.fn();
  constructor() { FakeWorklet.instances.push(this); }
}
describe('microphone retry ownership', () => {
  const streams: Array<{ track: { stop: ReturnType<typeof vi.fn>; onended: null | (() => void) } }> = [];
  const getUserMedia = vi.fn(async () => {
    const track = { stop: vi.fn(), onended: null };
    streams.push({ track });
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  });
  beforeEach(() => {
    vi.clearAllMocks(); streams.length = 0;
    FakeContext.instances = []; FakeContext.firstModule = null; FakeWorklet.instances = [];
    useStore.setState({ isRecording: false });
    vi.stubGlobal('AudioContext', FakeContext); vi.stubGlobal('AudioWorkletNode', FakeWorklet);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('waits for both Stop cleanups before Retry and preserves PCM after the old close resolves', async () => {
    const { result } = renderHook(() => useAudioRecorder());
    const pcm = vi.fn(); result.current.setOnDataAvailable(pcm);
    await act(async () => { expect(await result.current.startRecording()).toBe(true); });
    const closed = deferred(); FakeContext.instances[0].close.mockImplementation(() => closed.promise);
    let firstStop!: Promise<void>, secondStop!: Promise<void>, retry!: Promise<boolean>;
    act(() => { firstStop = result.current.stopRecording(); secondStop = result.current.stopRecording(); retry = result.current.startRecording(); });
    await act(async () => undefined);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => { closed.resolve(); await Promise.all([firstStop, secondStop]); expect(await retry).toBe(true); });
    expect(useStore.getState().isRecording).toBe(true);
    act(() => FakeWorklet.instances.at(-1)!.port.onmessage?.({ data: new Float32Array(2048) }));
    expect(pcm).toHaveBeenCalledOnce();
  });
  it('does not let an obsolete worklet startup destroy the new microphone', async () => {
    const moduleReady = deferred(); FakeContext.firstModule = moduleReady.promise;
    const { result } = renderHook(() => useAudioRecorder());
    const pcm = vi.fn(); result.current.setOnDataAvailable(pcm);
    let oldStart!: Promise<boolean>;
    act(() => { oldStart = result.current.startRecording(); });
    await waitFor(() => expect(FakeContext.instances[0]?.audioWorklet.addModule).toHaveBeenCalledOnce());
    await act(async () => { await result.current.stopRecording(); expect(await result.current.startRecording()).toBe(true); });
    await act(async () => { moduleReady.resolve(); expect(await oldStart).toBe(false); });
    expect(useStore.getState().isRecording).toBe(true);
    expect(streams[1].track.stop).not.toHaveBeenCalled();
    act(() => FakeWorklet.instances.at(-1)!.port.onmessage?.({ data: new Float32Array(2048) }));
    expect(pcm).toHaveBeenCalledOnce();
  });
});
