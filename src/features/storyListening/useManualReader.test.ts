// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useManualReader } from './useManualReader';

describe('manual sentence reader', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('turns only by touch, never by elapsed time', () => {
    const { result } = renderHook(() => useManualReader(3));
    act(() => { result.current.play(); vi.advanceTimersByTime(120_000); });
    expect(result.current).toMatchObject({ index: 0, finished: false, playing: false });
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 2, finished: true });
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
  });

  it('waits at a hands-on sentence until it is released', () => {
    const blocked = (i: number) => i === 1;
    const { result } = renderHook(() => useManualReader(3, blocked));
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 1, waiting: true });
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    act(() => result.current.release());
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 2, waiting: false, finished: true });
  });

  it('clamps jumps and keeps the chapter finished once the end was reached', () => {
    const { result } = renderHook(() => useManualReader(4));
    act(() => result.current.jump(99));
    expect(result.current).toMatchObject({ index: 3, finished: true });
    act(() => result.current.jump(-5));
    expect(result.current).toMatchObject({ index: 0, finished: true });
    act(() => result.current.jump(Number.NaN));
    expect(result.current.index).toBe(0);
  });
});
