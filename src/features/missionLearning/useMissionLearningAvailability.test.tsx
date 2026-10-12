// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMissionLearningAvailability } from './useMissionLearningAvailability';
import { fetchMissionLearningHome } from './api';

vi.mock('./config', () => ({ MISSION_LEARNING_ENABLED: true }));
vi.mock('./api', () => ({ fetchMissionLearningHome: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('recovers an unavailable backend when the window gains focus', async () => {
  vi.mocked(fetchMissionLearningHome).mockRejectedValueOnce(new Error('starting')).mockResolvedValue({ enabled: true, contractVersion: 1 });
  const { result } = renderHook(() => useMissionLearningAvailability());
  await waitFor(() => expect(result.current).toBe('unavailable'));
  act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(result.current).toBe('available'));
});

it('allows an explicit retry without trusting a failed or disabled response', async () => {
  vi.mocked(fetchMissionLearningHome).mockResolvedValueOnce({ enabled: false, contractVersion: 1 }).mockResolvedValue({ enabled: true, contractVersion: 1 });
  const { result, rerender } = renderHook(({ retry }) => useMissionLearningAvailability(retry), { initialProps: { retry: 0 } });
  await waitFor(() => expect(result.current).toBe('unavailable'));
  rerender({ retry: 1 });
  await waitFor(() => expect(result.current).toBe('available'));
});
it('does not interrupt an available lesson with focus health checks', async () => {
  vi.mocked(fetchMissionLearningHome).mockResolvedValue({ enabled: true, contractVersion: 1 });
  const { result } = renderHook(() => useMissionLearningAvailability());
  await waitFor(() => expect(result.current).toBe('available'));
  act(() => { window.dispatchEvent(new Event('focus')); });
  expect(fetchMissionLearningHome).toHaveBeenCalledTimes(1);
});
it('aborts old probes and ignores their stale failures after retry', async () => {
  let complete!: (home: { enabled: boolean; contractVersion: number }) => void;
  vi.mocked(fetchMissionLearningHome).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; })).mockResolvedValue({ enabled: true, contractVersion: 1 });
  const { result, rerender, unmount } = renderHook(({ retry }) => useMissionLearningAvailability(retry), { initialProps: { retry: 0 } });
  const signal = vi.mocked(fetchMissionLearningHome).mock.calls[0][0]!;
  rerender({ retry: 1 });
  await waitFor(() => expect(result.current).toBe('available'));
  expect(signal.aborted).toBe(true);
  await act(async () => { complete({ enabled: false, contractVersion: 1 }); });
  expect(result.current).toBe('available');
  const current = vi.mocked(fetchMissionLearningHome).mock.calls[1][0]!;
  unmount();
  expect(current.aborted).toBe(true);
});
