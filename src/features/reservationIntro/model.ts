import type { ReservationIntroEvent, ReservationIntroPhase } from './types';

const STORAGE_PREFIX = 'realtime-en:reservation-intro:';

type StoredIntro = {
  startedAtMs: number;
  completedAtMs?: number;
};

export function getReservationIntroApiUrl(kioskId: string): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const fallback = typeof window === 'undefined'
    ? 'ws://localhost:18003/ws'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:18003/ws`;
  const url = new URL(configured || fallback, typeof window === 'undefined' ? fallback : window.location.href);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = `/api/kiosks/${encodeURIComponent(kioskId)}/reservation-intro`;
  url.search = '';
  return url.toString();
}

export function nextFourSecondBoundaryDelay(nowMs: number): number {
  const remainder = nowMs % 4000;
  return remainder === 0 ? 4000 : 4000 - remainder;
}

export function deriveStartedAtMs(event: ReservationIntroEvent, receivedAtMs: number): number {
  return receivedAtMs + Date.parse(event.startedAt) - Date.parse(event.serverNow);
}

export function phaseForElapsed(event: ReservationIntroEvent, elapsedMs: number): ReservationIntroPhase {
  return elapsedMs < event.brandDurationMs ? 'brand' : 'guide';
}

export function readStoredIntro(eventId: string): StoredIntro | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${eventId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredIntro>;
    if (typeof value.startedAtMs !== 'number') return null;
    return value as StoredIntro;
  } catch {
    return null;
  }
}

export function rememberIntroStarted(eventId: string, startedAtMs: number): StoredIntro {
  const value = { startedAtMs };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`${STORAGE_PREFIX}${eventId}`, JSON.stringify(value));
  }
  return value;
}

export function rememberIntroCompleted(eventId: string, startedAtMs: number): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    `${STORAGE_PREFIX}${eventId}`,
    JSON.stringify({ startedAtMs, completedAtMs: Date.now() }),
  );
}
