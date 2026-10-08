// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSentencePlayer } from './useSentencePlayer';

const LINES = ['One.', 'Two.', 'Three.'];
const CLIPS = LINES.map((text, i) => ({ text, src: `/story-audio/test/s${i}.wav`, durationMs: 4000 }));
class TestAudio extends EventTarget {
  static all: TestAudio[] = [];
  static nextPlay: (() => Promise<void>) | null = null;
  currentTime = 0; duration = 4; playbackRate = 1; preservesPitch = true; preload = ''; ended = false; paused = true;
  play = vi.fn(() => { this.paused = false; return TestAudio.nextPlay?.() ?? Promise.resolve(); });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn(); removeAttribute = vi.fn();
  constructor(public src: string) { super(); TestAudio.all.push(this); }
  finish() { this.ended = true; this.dispatchEvent(new Event('ended')); }
}
const audio = () => TestAudio.all.at(-1)!;
const start = async (p: { play: () => void }) => { await act(async () => p.play()); };

describe('story audio playback', () => {
  beforeEach(() => { vi.useFakeTimers(); TestAudio.all = []; TestAudio.nextPlay = null; vi.stubGlobal('Audio', TestAudio); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('advances on natural completion, never elapsed reading time', async () => {
    const { result } = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, CLIPS));
    await start(result.current); act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.index).toBe(0);
    await act(async () => audio().finish()); expect(result.current.index).toBe(1);
    await act(async () => audio().finish()); expect(result.current.finished).toBe(false);
    await act(async () => audio().finish()); expect(result.current).toMatchObject({ playing: false, finished: true });
  });
  it('waits for an activity and ignores duplicate releases', async () => {
    const blocked = new Set([1]);
    const { result } = renderHook(() => useSentencePlayer(LINES, 'normal', i => blocked.has(i), CLIPS));
    await start(result.current); await act(async () => audio().finish());
    expect(result.current).toMatchObject({ index: 1, waiting: true, playing: false });
    await start(result.current); expect(result.current.waiting).toBe(true);
    blocked.delete(1); await act(async () => result.current.release());
    const current = audio(); expect(result.current.playing).toBe(true);
    await act(async () => result.current.release()); expect(current.play).toHaveBeenCalledTimes(1);
  });
  it('preserves position on pause/resume and ignores obsolete ended after same-index jump', async () => {
    const { result } = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, CLIPS));
    await start(result.current); const previous = audio(); previous.currentTime = 1.5;
    act(() => result.current.pause()); await start(result.current);
    expect(audio()).toBe(previous); expect(audio().currentTime).toBe(1.5);
    await act(async () => result.current.jump(0)); expect(audio()).not.toBe(previous);
    act(() => previous.finish()); expect(result.current.index).toBe(0);
  });
  it('keeps a user pause authoritative over late play resolution', async () => {
    let resolve!: () => void; TestAudio.nextPlay = () => new Promise<void>(r => { resolve = r; });
    const { result } = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, CLIPS));
    act(() => result.current.play()); act(() => result.current.pause());
    await act(async () => resolve()); expect(result.current.playing).toBe(false); expect(audio().paused).toBe(true);
  });
  it('recovers autoplay blocking without advancing', async () => {
    TestAudio.nextPlay = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
    const { result } = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, CLIPS));
    await start(result.current); expect(result.current).toMatchObject({ index: 0, blocked: true, playing: false });
    TestAudio.nextPlay = null; await start(result.current); expect(result.current).toMatchObject({ blocked: false, playing: true });
  });
  it('bounds pending load, retries the same clip and does not hide media errors', async () => {
    TestAudio.nextPlay = () => new Promise<void>(() => {});
    const { result } = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, CLIPS));
    act(() => result.current.play()); act(() => vi.advanceTimersByTime(10_001)); expect(result.current.error).toBeTruthy();
    TestAudio.nextPlay = null; await start(result.current); expect(result.current).toMatchObject({ index: 0, playing: true, error: null });
    act(() => audio().dispatchEvent(new Event('error'))); act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toMatchObject({ index: 0, playing: false, finished: false }); expect(result.current.error).toBeTruthy();
  });
  it('uses media progress and changes speed without restarting', async () => {
    const { result, rerender } = renderHook(({ speed }) => useSentencePlayer(LINES, speed, undefined, CLIPS), { initialProps: { speed: 'normal' as 'normal' | 'slow' } });
    await start(result.current); const current = audio(); current.currentTime = 2;
    act(() => current.dispatchEvent(new Event('timeupdate'))); expect(result.current.progress).toBe(0.5);
    rerender({ speed: 'slow' }); expect(audio()).toBe(current); expect(current.playbackRate).toBe(0.8); expect(current.currentTime).toBe(2);
  });
  it('fails closed for mismatched content and stops on unmount', async () => {
    const bad = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, [{ ...CLIPS[0], text: 'Wrong.' }]));
    await start(bad.result.current); expect(bad.result.current.error).toBeTruthy(); expect(TestAudio.all).toHaveLength(0); bad.unmount();
    const good = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, CLIPS)); await start(good.result.current);
    const current = audio(); good.unmount(); current.finish(); expect(current.pause).toHaveBeenCalled(); expect(current.removeAttribute).toHaveBeenCalledWith('src');
  });
  it('replays one evidence sentence without continuing the whole chapter', async () => {
    const { result } = renderHook(() => useSentencePlayer(LINES, 'normal', undefined, CLIPS, true));
    await act(async () => result.current.jump(1));
    await act(async () => audio().finish());
    expect(result.current).toMatchObject({ index: 1, playing: false, finished: true });
    expect(TestAudio.all).toHaveLength(1);
  });
});
