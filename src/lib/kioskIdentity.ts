const KIOSK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const DEFAULT_KIOSK_ID = 'A01';

export type KioskRole = 'controller' | 'viewer';

export function getKioskIdFromLocation(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_KIOSK_ID;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const kioskId = searchParams.get('kioskId')?.trim() || DEFAULT_KIOSK_ID;
  return KIOSK_ID_PATTERN.test(kioskId) ? kioskId : DEFAULT_KIOSK_ID;
}

export function buildKioskUrl(pathname: string, kioskId = getKioskIdFromLocation()): string {
  const params = new URLSearchParams();
  params.set('kioskId', kioskId);
  return `${pathname}?${params.toString()}`;
}

export function getChatSyncChannelName(kioskId = getKioskIdFromLocation()): string {
  return `uxroom_chat_sync:${kioskId}`;
}

export function withKioskSessionParams(wsUrl: string, role: KioskRole): string {
  const kioskId = getKioskIdFromLocation();
  const url = new URL(wsUrl, typeof window === 'undefined' ? 'ws://localhost' : window.location.href);
  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }
  url.searchParams.set('kioskId', kioskId);
  url.searchParams.set('role', role);
  return url.toString();
}

export function createClientCommandId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
