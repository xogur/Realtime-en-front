// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationEndOverlay } from './ReservationEndOverlay';
import type { UsageSession } from './types';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') } }));

const session: UsageSession = {
  reservationId: 154,
  kioskId: 'A02',
  currentRoomNumber: 1,
  status: 'ended',
  serverNow: '2026-08-24T05:30:00Z',
  endAt: '2026-08-24T05:30:00Z',
  endedAt: '2026-08-24T05:30:00Z',
  endReason: 'NATURAL',
  canResume: false,
  isGuest: true,
  canSignup: true,
  participantNameReady: true,
  signupUrl: 'https://example.test/signup',
  followup: null,
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ReservationEndOverlay', () => {
  // Regression: ISSUE-001 — polling replaced the session object and cleared the selected time.
  // Found by /qa on 2026-08-24.
  // Report: COCOON_RESERVATION_FOLLOWUP_IMPLEMENTATION.md
  it('keeps the selected slot when polling returns the same reservation as a new object', async () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => new Response(JSON.stringify(String(input).includes('availability-calendar') ? {
      from: date,
      to: date,
      durationMinutes: 30,
      days: [{ date, status: 'available', availableSlotCount: 1, message: null }],
    } : {
      date,
      durationMinutes: 30,
      closed: false,
      message: null,
      slots: [{
        startTime: '14:00',
        nominalEndTime: '14:30',
        availableRooms: [{ roomId: 3, roomNumber: 3 }],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const view = render(<ReservationEndOverlay role="avatar" session={session} />);
    fireEvent.click(screen.getByRole('button', { name: /다음 예약 일정 잡기/ }));
    fireEvent.click(await screen.findByRole('gridcell', { name: new RegExp(`${today.getMonth() + 1}월 ${today.getDate()}일`) }));
    fireEvent.click(await screen.findByRole('button', { name: /14:00.*14:30/ }));
    expect(await screen.findByRole('button', { name: /코쿤 3/ })).not.toBeNull();

    view.rerender(<ReservationEndOverlay role="avatar" session={{ ...session }} />);

    await waitFor(() => expect(screen.getByRole('button', { name: /코쿤 3/ })).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not show signup to a registered member', () => {
    render(<ReservationEndOverlay role="avatar" session={{
      ...session,
      isGuest: false,
      canSignup: false,
      signupUrl: null,
    }} />);
    expect(screen.queryByRole('button', { name: /회원가입 하기/ })).toBeNull();
    expect(screen.queryByRole('img', { name: /소셜 로그인 및 회원가입 QR/ })).toBeNull();
    expect(screen.getByRole('button', { name: /다음 예약 일정 잡기/ })).not.toBeNull();
  });

  it('shows the signup QR alongside the booking choice for guests', async () => {
    render(<ReservationEndOverlay role="avatar" session={session} />);

    expect(screen.getByRole('button', { name: /다음 예약 일정 잡기/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /회원가입/ })).toBeNull();
    expect(await screen.findByRole('img', { name: /소셜 로그인 및 회원가입 QR/ })).not.toBeNull();
    expect(screen.getByText(/QR을 스캔하면 코쿤 예약 페이지로 이동합니다/)).not.toBeNull();
  });

  it('does not tell a registered member to choose signup on the guide display', () => {
    render(<ReservationEndOverlay role="guide" session={{
      ...session,
      isGuest: false,
      canSignup: false,
      signupUrl: null,
    }} />);
    expect(screen.getByText('왼쪽 화면에서 다음 예약을 선택해 주세요.')).not.toBeNull();
    expect(screen.queryByText(/또는 회원가입/)).toBeNull();
  });

  it('returns to the main English project screen 10 seconds after booking', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReservationEndOverlay role="avatar" session={{
      ...session,
      status: 'booked',
      followup: {
        reservationId: 201,
        roomNumber: 3,
        startAt: '2026-08-28T07:30:00Z',
        endAt: '2026-08-28T08:00:00Z',
      },
    }} />);

    expect(screen.getByText(/10초 후 메인 영어 프로젝트 화면으로 돌아갑니다/)).not.toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/dismiss'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports a failed finish instead of silently keeping the overlay open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: '종료된 이용 세션을 찾을 수 없습니다.' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })));
    render(<ReservationEndOverlay role="avatar" session={session} />);

    fireEvent.click(screen.getByRole('button', { name: '예약하지 않고 이용 마치기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('종료된 이용 세션을 찾을 수 없습니다.');
  });

  it('delegates a successful finish to the session owner', async () => {
    const onDismiss = vi.fn(async () => undefined);
    render(<ReservationEndOverlay role="avatar" session={session} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: '예약하지 않고 이용 마치기' }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('does not allow a choice while the end write is still pending', () => {
    render(<ReservationEndOverlay role="avatar" session={session} endPending />);

    expect((screen.getByRole('button', { name: /다음 예약 일정 잡기/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '예약하지 않고 이용 마치기' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('이용 종료를 저장하고 있습니다…')).not.toBeNull();
  });

  it('shows resume only on the avatar display when the server allows it', async () => {
    const resumable = { ...session, endReason: 'MANUAL' as const, canResume: true };
    const onResume = vi.fn(async () => ({ ...resumable, status: 'active' as const }));
    const view = render(<ReservationEndOverlay role="avatar" session={resumable} onResume={onResume} />);

    fireEvent.click(screen.getByRole('button', { name: /잘못 눌렀어요/ }));
    await waitFor(() => expect(onResume).toHaveBeenCalledTimes(1));

    view.rerender(<ReservationEndOverlay role="guide" session={resumable} onResume={onResume} />);
    expect(screen.queryByRole('button', { name: /잘못 눌렀어요/ })).toBeNull();
  });
});
