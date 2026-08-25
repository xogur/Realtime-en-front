// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReservationFollowup } from './useReservationFollowup';

const activeSession = {
  reservationId: 287,
  kioskId: 'A02',
  status: 'active',
  serverNow: '2026-08-25T02:25:00Z',
  endAt: '2026-08-25T02:25:00Z',
  endedAt: null,
  endReason: null,
  isGuest: true,
  canSignup: true,
  participantNameReady: true,
  signupUrl: 'https://www.ulju.ulsan.kr/ujai/login/',
  followup: null,
} as const;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('useReservationFollowup', () => {
  it('clears a second display after the first display dismisses an ended session', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/?kioskId=A02');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(activeSession), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...activeSession, status: 'ended', endedAt: activeSession.endAt, endReason: 'NATURAL' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReservationFollowup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.session?.status).toBe('ended');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(result.current.session).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/reservation-session'),
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
    );
  });
});
