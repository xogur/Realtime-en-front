import { describe, expect, it } from 'vitest';
import {
  deriveStartedAtMs,
  getReservationIntroApiUrl,
  nextFourSecondBoundaryDelay,
  phaseForElapsed,
} from './model';
import type { ReservationIntroEvent } from './types';

const event: ReservationIntroEvent = {
  eventId: 'cocoon:154:intro',
  reservationId: 154,
  kioskId: 'A02',
  status: 'ready',
  eligibleAt: '2026-08-21T05:00:00.000Z',
  startedAt: '2026-08-21T05:00:04.500Z',
  serverNow: '2026-08-21T05:00:04.000Z',
  endAt: '2026-08-21T05:30:00.000Z',
  assetVersion: 'intro-v1',
  brandDurationMs: 5600,
  guideDurationMs: 20700,
  maxDurationMs: 40000,
  activePollMs: 250,
};

describe('reservation intro timeline', () => {
  it('aligns idle polling to a shared four-second wall-clock boundary', () => {
    expect(nextFourSecondBoundaryDelay(8_000)).toBe(4_000);
    expect(nextFourSecondBoundaryDelay(8_001)).toBe(3_999);
    expect(nextFourSecondBoundaryDelay(11_999)).toBe(1);
  });

  it('uses server time to remove client clock skew', () => {
    expect(deriveStartedAtMs(event, 1_000_000)).toBe(1_000_500);
  });

  it('switches from brand to guide at the rendered 5.6-second boundary', () => {
    expect(phaseForElapsed(event, 5_599)).toBe('brand');
    expect(phaseForElapsed(event, 5_600)).toBe('guide');
  });

  it('builds the HTTP endpoint from the configured WebSocket endpoint', () => {
    process.env.NEXT_PUBLIC_WS_URL = 'ws://localhost:18003/ws';
    expect(getReservationIntroApiUrl('A02')).toBe(
      'http://localhost:18003/api/kiosks/A02/reservation-intro',
    );
  });
});
