export function getLearningHomeApiUrl(kioskId?: string): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const fallback = typeof window === 'undefined'
    ? 'ws://localhost:18003/ws'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:18003/ws`;
  const url = new URL(configured || fallback, typeof window === 'undefined' ? fallback : window.location.href);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = kioskId
    ? `/api/kiosks/${encodeURIComponent(kioskId)}/learning/home`
    : '/api/learning/home';
  url.search = '';
  return url.toString();
}
