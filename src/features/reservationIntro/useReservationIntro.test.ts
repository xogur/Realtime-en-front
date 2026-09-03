import { describe, expect, it } from 'vitest';
import {
  isReservationProgramReady,
  presenceReportRetryDelayMs,
  shouldReportPresence,
} from './useReservationIntro';
import type { ReservationIntroEvent } from './types';

const waitingSession = {
  eventId: 'cocoon:338:intro',
  status: 'waiting_for_presence',
} as ReservationIntroEvent;

function reportable(overrides: Partial<Parameters<typeof shouldReportPresence>[0]> = {}) {
  return shouldReportPresence({
    role: 'avatar',
    present: true,
    lastPositiveAtMs: 10_000,
    nowMs: 10_500,
    session: waitingSession,
    reportedEventId: null,
    inFlight: false,
    ...overrides,
  });
}

describe('reservation intro presence report policy', () => {
  it('reports a fresh confirmed presence for a waiting reservation', () => {
    expect(reportable()).toBe(true);
  });

  it('does not report without a reservation or with stale evidence', () => {
    expect(reportable({ session: null })).toBe(false);
    expect(reportable({ nowMs: 10_751 })).toBe(false);
    expect(reportable({ nowMs: 9_999 })).toBe(false);
  });

  it('reports at most once for the same reservation event', () => {
    expect(reportable({ reportedEventId: waitingSession.eventId })).toBe(false);
  });

  it('allows a new reservation event after the previous event was reported', () => {
    const nextSession = {
      ...waitingSession,
      eventId: 'cocoon:339:intro',
    };
    expect(reportable({
      session: nextSession,
      reportedEventId: waitingSession.eventId,
    })).toBe(true);
  });

  it('does not report from the guide screen or while a request is in flight', () => {
    expect(reportable({ role: 'guide' })).toBe(false);
    expect(reportable({ inFlight: true })).toBe(false);
  });

  it('backs off failed presence reports without exceeding four seconds', () => {
    expect(presenceReportRetryDelayMs(1)).toBe(500);
    expect(presenceReportRetryDelayMs(2)).toBe(1_000);
    expect(presenceReportRetryDelayMs(4)).toBe(4_000);
    expect(presenceReportRetryDelayMs(20)).toBe(4_000);
  });
});

describe('reservation program readiness', () => {
  const completedSession = {
    ...waitingSession,
    status: 'completed',
  } as ReservationIntroEvent;

  it('becomes ready only after the intro presentation and participant confirmation are finished', () => {
    expect(isReservationProgramReady(completedSession, false, false)).toBe(true);
    expect(isReservationProgramReady(completedSession, true, false)).toBe(false);
    expect(isReservationProgramReady(completedSession, false, true)).toBe(false);
  });

  it('does not become ready before the reservation intro is completed', () => {
    expect(isReservationProgramReady(waitingSession, false, false)).toBe(false);
    expect(isReservationProgramReady(null, false, false)).toBe(false);
  });
});
