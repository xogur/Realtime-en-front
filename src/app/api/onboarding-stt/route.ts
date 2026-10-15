import { NextRequest, NextResponse } from 'next/server';
import { isOnboardingSttHint, ONBOARDING_STT_HINTS } from '@/lib/onboardingSttHints';

export const runtime = 'nodejs';
const MAX_BYTES = 16_000 * 2 * 12;
const DEFAULT_STT_URL = 'http://stt:8013/transcribe/ko';
const LANGUAGES = new Set(['ko', 'en']);

/**
 * The configured Korean endpoint, switched to the requested language (same Crisper executor).
 * null when a custom URL has no `/transcribe/ko` suffix: never send English audio to a Korean model.
 */
function sttUrl(language: string): string | null {
  const configured = process.env.ONBOARDING_STT_URL || DEFAULT_STT_URL;
  const suffix = /\/transcribe\/ko\/?$/;
  if (language === 'ko') return configured;
  return suffix.test(configured) ? configured.replace(suffix, `/transcribe/${language}`) : null;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  let allowedOrigin = !origin;
  try { allowedOrigin ||= new URL(origin!).host === request.headers.get('host'); } catch { /* reject malformed Origin */ }
  if (!allowedOrigin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const language = request.nextUrl.searchParams.get('language') ?? 'ko';
  if (!LANGUAGES.has(language)) return NextResponse.json({ error: 'invalid_language' }, { status: 400 });
  const hint = request.nextUrl.searchParams.get('hint');
  if (hint !== null && (language !== 'ko' || !isOnboardingSttHint(hint))) {
    return NextResponse.json({ error: 'invalid_hint' }, { status: 400 });
  }
  if (request.headers.get('content-type') !== 'application/octet-stream') {
    return NextResponse.json({ error: 'invalid_audio' }, { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'missing_audio' }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return NextResponse.json({ error: 'audio_too_long' }, { status: 413 });
    }
    chunks.push(value);
  }
  if (size < 3200 || size % 2) return NextResponse.json({ error: 'invalid_audio' }, { status: 400 });
  const url = sttUrl(language);
  if (!url) return NextResponse.json({ error: 'stt_unavailable' }, { status: 503 });
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
  // A header (percent-encoded UTF-8), so an STT server without context support ignores it.
  if (hint !== null) headers['X-STT-Context'] = encodeURIComponent(ONBOARDING_STT_HINTS[hint]);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: 'stt_unavailable' }, { status: response.status === 429 ? 429 : 503 });
    const data = await response.json();
    return NextResponse.json({ text: String(data.text ?? ''), language, provider: 'crisperwhisper' });
  } catch {
    return NextResponse.json({ error: 'stt_unavailable' }, { status: 503 });
  }
}
