// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { END_OVERLAY_IDLE_DISMISS_MS, ReservationEndOverlay } from './ReservationEndOverlay';
import type { UsageSession } from './types';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') } }));

const ended: UsageSession = {
  reservationId: 154,
  kioskId: 'A02',
  currentRoomNumber: 2,
  status: 'ended',
  serverNow: '2026-08-24T05:30:00Z',
  endAt: '2026-08-24T05:30:00Z',
  endedAt: '2026-08-24T05:30:00Z',
  endReason: 'NATURAL',
  canResume: false,
  isGuest: false,
  canSignup: false,
  participantNameReady: true,
  signupUrl: null,
  followup: null,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ReservationEndOverlay idle dismissal', () => {
  it('finishes an unattended end screen after the idle limit', async () => {
    const onDismiss = vi.fn(async () => undefined);
    render(<ReservationEndOverlay role="avatar" session={ended} onDismiss={onDismiss} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(END_OVERLAY_IDLE_DISMISS_MS - 1); });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('restarts the idle limit on every touch', async () => {
    const onDismiss = vi.fn(async () => undefined);
    render(<ReservationEndOverlay role="avatar" session={ended} onDismiss={onDismiss} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(END_OVERLAY_IDLE_DISMISS_MS - 1_000); });
    fireEvent.pointerDown(screen.getByRole('dialog'));
    await act(async () => { await vi.advanceTimersByTimeAsync(END_OVERLAY_IDLE_DISMISS_MS - 1_000); });
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('keeps polling refreshes of the same session from postponing dismissal', async () => {
    const onDismiss = vi.fn(async () => undefined);
    const view = render(<ReservationEndOverlay role="avatar" session={ended} onDismiss={onDismiss} />);

    for (let elapsed = 0; elapsed < END_OVERLAY_IDLE_DISMISS_MS; elapsed += 2_000) {
      view.rerender(<ReservationEndOverlay role="avatar" session={{ ...ended }} onDismiss={onDismiss} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    }
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('posts dismissal itself when no handler is supplied', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReservationEndOverlay role="avatar" session={ended} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(END_OVERLAY_IDLE_DISMISS_MS); });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/api/kiosks/A02/reservation-session/dismiss');
    expect(JSON.parse(String(init.body))).toEqual({ reservationId: 154 });
  });

  it('never dismisses from the guide screen, an active session or a booked session', async () => {
    const onDismiss = vi.fn(async () => undefined);
    const view = render(<ReservationEndOverlay role="guide" session={ended} onDismiss={onDismiss} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(END_OVERLAY_IDLE_DISMISS_MS); });
    view.rerender(<ReservationEndOverlay role="avatar" session={{ ...ended, status: 'active' }} onDismiss={onDismiss} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(END_OVERLAY_IDLE_DISMISS_MS); });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('shows a manual fallback when automatic dismissal fails', async () => {
    const onDismiss = vi.fn(async () => { throw new Error('offline'); });
    render(<ReservationEndOverlay role="avatar" session={ended} onDismiss={onDismiss} />);

    await act(async () => { await vi.advanceTimersByTimeAsync(END_OVERLAY_IDLE_DISMISS_MS); });

    expect(screen.getByRole('alert').textContent).toContain('아래 버튼을 눌러 주세요');
  });
});
