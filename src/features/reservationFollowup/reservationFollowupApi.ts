import { getReservationSessionApiUrl } from './model';
import type { Availability, AvailabilityCalendar, DurationMinutes, UsageSession } from './types';

export class ReservationApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new ReservationApiError(body?.detail || fallback, response.status);
  }
  return response.json() as Promise<T>;
}

export function getAvailabilityCalendar(kioskId: string, from: string, to: string, duration: DurationMinutes, signal?: AbortSignal) {
  const url = new URL(`${getReservationSessionApiUrl(kioskId)}/availability-calendar`);
  url.searchParams.set('from', from); url.searchParams.set('to', to); url.searchParams.set('durationMinutes', String(duration));
  return fetch(url, { cache: 'no-store', signal }).then((response) => read<AvailabilityCalendar>(response, '예약 가능 날짜를 불러오지 못했습니다.'));
}

export function getDayAvailability(kioskId: string, date: string, duration: DurationMinutes, signal?: AbortSignal) {
  const url = new URL(`${getReservationSessionApiUrl(kioskId)}/availability`);
  url.searchParams.set('date', date); url.searchParams.set('durationMinutes', String(duration)); url.searchParams.set('includeUnavailable', 'true');
  return fetch(url, { cache: 'no-store', signal }).then((response) => read<Availability>(response, '예약 가능 시간을 불러오지 못했습니다.'));
}

export function createFollowupReservation(kioskId: string, body: object, signal?: AbortSignal) {
  return fetch(`${getReservationSessionApiUrl(kioskId)}/followup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
    .then((response) => read<UsageSession>(response, '예약을 완료하지 못했습니다.'));
}
