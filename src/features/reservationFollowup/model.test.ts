import { describe, expect, it } from 'vitest';
import { addOneCalendarMonth, endDeadlineMs, getReservationSessionApiUrl, reconcilePolledSession } from './model';
import { getKioskDisplayCocoon } from './cocoonSceneModel';
import type { UsageSession } from './types';

describe('reservation follow-up model', () => {
  it('highlights only physical English-project cocoons', () => {
    expect(getKioskDisplayCocoon('A02', 2)).toBe(2);
    expect(getKioskDisplayCocoon('A03', 3)).toBe(3);
    expect(getKioskDisplayCocoon('A04', 4)).toBe(4);
    expect(getKioskDisplayCocoon('A05', 5)).toBeNull();
  });

  it('clamps a calendar month at month end', () => {
    expect(addOneCalendarMonth(new Date(2027, 0, 31))).toEqual(new Date(2027, 1, 28));
  });

  it('derives the end deadline from server time instead of client clock', () => {
    expect(endDeadlineMs('2026-08-24T05:00:00Z', '2026-08-24T05:30:00Z', 10_000)).toBe(1_810_000);
  });

  it('uses the same backend origin as reservation intro', () => {
    expect(getReservationSessionApiUrl('A02')).toContain('/api/kiosks/A02/reservation-session');
  });

  it('does not reopen the program when end persistence temporarily fails', () => {
    const active = {
      reservationId: 154,
      kioskId: 'A02',
      status: 'active',
      serverNow: '2026-08-24T05:00:00Z',
      endAt: '2026-08-24T05:30:00Z',
      endedAt: null,
      endReason: null,
      canResume: false,
      isGuest: false,
      canSignup: false,
      participantNameReady: true,
      signupUrl: null,
      followup: null,
    } satisfies UsageSession;
    const locallyEnded = {
      ...active,
      status: 'ended',
      endedAt: '2026-08-24T05:30:00Z',
      endReason: 'NATURAL',
    } satisfies UsageSession;

    expect(reconcilePolledSession(active, {
      reservationId: 154,
      reason: 'NATURAL',
      session: locallyEnded,
    })).toEqual(locallyEnded);
  });
});
