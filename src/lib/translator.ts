export type TranslationLanguage = 'ko' | 'en';

export type TranslationProvider = 'ollama' | 'azure' | 'deepl' | 'papago' | 'argos';

export type TranslationSentenceType = 'original' | 'question' | 'exclamation';

export const TRANSLATOR_WINDOW_MESSAGE = 'realtime-en:translator';
export const MAX_TRANSLATION_TEXT_LENGTH = 160;

export type TranslatorWindowMessage = {
  channel: typeof TRANSLATOR_WINDOW_MESSAGE;
  action: 'open' | 'close';
};

export function isTranslatorWindowMessage(value: unknown): value is TranslatorWindowMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<TranslatorWindowMessage>;
  return message.channel === TRANSLATOR_WINDOW_MESSAGE
    && (message.action === 'open' || message.action === 'close');
}

const TERMINAL_PUNCTUATION = /[.!?。！？]+$/u;
const KOREAN_QUESTION_ENDING = /(?:까|인가요|나요|까요)$/u;
const ENGLISH_QUESTION_START = /^(?:who|what|when|where|why|how|do|does|did|is|are|am|was|were|can|could|will|would|should|have|has|had)\b/iu;

export function applySentenceType(
  rawText: string,
  sentenceType: TranslationSentenceType,
): string {
  const text = rawText.trim();
  if (!text) return '';
  const withoutPunctuation = text.replace(TERMINAL_PUNCTUATION, '').trimEnd();
  if (sentenceType === 'question') return `${withoutPunctuation}?`;
  if (sentenceType === 'exclamation') return `${withoutPunctuation}!`;
  return withoutPunctuation;
}

export function normalizeSpeechTranscript(
  rawText: string,
  language: TranslationLanguage,
): { text: string; sentenceType: TranslationSentenceType; inferred: boolean } {
  const text = rawText.trim();
  if (!text) return { text: '', sentenceType: 'original', inferred: false };

  const spokenPunctuation = language === 'ko'
    ? [
        { pattern: /\s*(?:물음표|질문표)$/u, sentenceType: 'question' as const },
        { pattern: /\s*느낌표$/u, sentenceType: 'exclamation' as const },
        { pattern: /\s*마침표$/u, sentenceType: 'original' as const },
      ]
    : [
        { pattern: /\s+(?:question mark)$/iu, sentenceType: 'question' as const },
        { pattern: /\s+(?:exclamation (?:mark|point))$/iu, sentenceType: 'exclamation' as const },
        { pattern: /\s+(?:period|full stop)$/iu, sentenceType: 'original' as const },
      ];

  for (const punctuation of spokenPunctuation) {
    if (punctuation.pattern.test(text)) {
      return {
        text: applySentenceType(text.replace(punctuation.pattern, ''), punctuation.sentenceType),
        sentenceType: punctuation.sentenceType,
        inferred: true,
      };
    }
  }

  if (/[?？]$/u.test(text)) return { text, sentenceType: 'question', inferred: false };
  if (/[!！]$/u.test(text)) return { text, sentenceType: 'exclamation', inferred: false };

  const looksLikeQuestion = language === 'ko'
    ? KOREAN_QUESTION_ENDING.test(text) && text !== '그러니까'
    : ENGLISH_QUESTION_START.test(text);
  if (looksLikeQuestion) {
    return { text: applySentenceType(text, 'question'), sentenceType: 'question', inferred: true };
  }

  return { text, sentenceType: 'original', inferred: false };
}

export type TranslationResponse = {
  translated_text: string;
  source_language: TranslationLanguage;
  target_language: TranslationLanguage;
  provider: TranslationProvider;
  fallback_reason?: string | null;
};

const TRANSLATION_PROVIDERS = new Set<TranslationProvider>(['ollama', 'azure', 'deepl', 'papago', 'argos']);

type TranslatorEnvironment = {
  apiUrl?: string;
  wsUrl?: string;
  locationOrigin?: string;
};

export function resolveTranslatorApiUrl(environment: TranslatorEnvironment): string {
  const explicitUrl = environment.apiUrl?.trim();
  if (explicitUrl) {
    return `${explicitUrl.replace(/\/$/, '')}/api/translate`;
  }

  const wsUrl = environment.wsUrl?.trim();
  if (wsUrl) {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '/api/translate';
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  const origin = environment.locationOrigin?.trim();
  return `${origin?.replace(/\/$/, '') ?? ''}/api/translate`;
}

export function getTranslatorApiUrl(): string {
  return resolveTranslatorApiUrl({
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    wsUrl: process.env.NEXT_PUBLIC_WS_URL,
    locationOrigin: typeof window === 'undefined' ? undefined : window.location.origin,
  });
}

export async function translateText(
  text: string,
  sourceLanguage: TranslationLanguage,
  targetLanguage: TranslationLanguage,
  signal?: AbortSignal,
): Promise<TranslationResponse> {
  const response = await fetch(getTranslatorApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      source_language: sourceLanguage,
      target_language: targetLanguage,
    }),
    signal,
  });

  const body = await response.json().catch(() => null) as TranslationResponse | { detail?: string } | null;
  if (!response.ok) {
    const detail = body && 'detail' in body ? body.detail : undefined;
    throw new Error(detail || '번역 서버에 연결하지 못했습니다.');
  }
  if (
    !body
    || !('translated_text' in body)
    || typeof body.translated_text !== 'string'
    || !TRANSLATION_PROVIDERS.has(body.provider)
    || (body.fallback_reason !== undefined
      && body.fallback_reason !== null
      && typeof body.fallback_reason !== 'string')
    || body.source_language !== sourceLanguage
    || body.target_language !== targetLanguage
  ) {
    throw new Error('번역 서버가 올바르지 않은 응답을 보냈습니다.');
  }
  return body;
}
