import { getReservationIntroApiUrl } from '@/features/reservationIntro/model';
import type { UsageSession } from './types';

export function getReservationSessionApiUrl(kioskId: string): string {
  return getReservationIntroApiUrl(kioskId).replace(/\/reservation-intro\/?$/, '/reservation-session');
}

export function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addOneCalendarMonth(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
}

export function endDeadlineMs(serverNow: string, endAt: string, receivedAtMs: number): number {
  return receivedAtMs + Date.parse(endAt) - Date.parse(serverNow);
}

export type ForcedEnd = {
  reservationId: number;
  reason: 'NATURAL' | 'MANUAL';
  session: UsageSession;
};

export function reconcilePolledSession(next: UsageSession, forced: ForcedEnd | null): UsageSession {
  if (forced && forced.reservationId === next.reservationId && next.status === 'active') {
    return forced.session;
  }
  return next;
}
