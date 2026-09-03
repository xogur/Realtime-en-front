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
  canResume: false,
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
  it('polls the reservation session for A05', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/?KioskId=A05');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useReservationFollowup());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/kiosks/A05/reservation-session'),
      expect.any(Object),
    );
  });

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

  it('resumes a manually ended session without letting forced end close it again', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T02:25:00Z'));
    window.history.replaceState({}, '', '/?KioskId=A02');
    const ended = {
      ...activeSession,
      status: 'ended' as const,
      endAt: '2026-08-25T03:00:00Z',
      endedAt: '2026-08-25T02:30:00Z',
      endReason: 'MANUAL' as const,
      canResume: true,
    };
    const resumed = {
      ...ended,
      status: 'active' as const,
      endedAt: null,
      endReason: null,
      canResume: false,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(ended), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(resumed), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(resumed), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useReservationFollowup());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.session?.canResume).toBe(true);

    await act(async () => { await result.current.resumeUsage(); });
    expect(result.current.session?.status).toBe('active');
    expect(result.current.resumeSignal).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/end'))).toHaveLength(0);
  });

  it('blocks duplicate resume clicks while the first request is pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T02:20:00Z'));
    window.history.replaceState({}, '', '/?KioskId=A02');
    const ended = {
      ...activeSession,
      status: 'ended' as const,
      endedAt: '2026-08-25T02:20:00Z',
      endReason: 'MANUAL' as const,
      canResume: true,
    };
    let releaseResume!: (value: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => { releaseResume = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(ended), { status: 200 }))
      .mockReturnValueOnce(pendingResponse);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useReservationFollowup());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    let first!: Promise<unknown>;
    await act(async () => {
      first = result.current.resumeUsage();
      await expect(result.current.resumeUsage()).rejects.toThrow('다시 시작하고 있습니다');
      releaseResume(new Response(JSON.stringify({ ...activeSession, canResume: false }), { status: 200 }));
      await first;
    });

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/resume'))).toHaveLength(1);
  });
});
