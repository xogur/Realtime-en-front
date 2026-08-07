export type SttProviderName = 'browser' | 'server';
export type BrowserSttAecMode = 'auto' | 'standard' | 'off';

export type SpeechEvidenceV1 = {
  version: 1;
  provider: 'browser';
  finalSegments: string[];
};

export type BrowserFinalTranscript = {
  text: string;
  speechEvidence: SpeechEvidenceV1;
};

export type BrowserSpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    readonly isFinal: boolean;
    readonly length: number;
    readonly [index: number]: { readonly transcript: string; readonly confidence?: number } | undefined;
  }>;
};

export type IndexedBrowserFinalSegment = {
  resultIndex: number;
  transcript: string;
};

export type BrowserSttConfig = {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally: boolean;
  unspokenPunctuation: boolean;
  aecMode: BrowserSttAecMode;
  autoGainControl: boolean;
  phrases: string[];
  silenceMs: number;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
};

const parseAecMode = (value: string | undefined): BrowserSttAecMode => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'off') return normalized;
  return 'auto';
};

export function resolveSttProvider(value?: string): SttProviderName {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'browser' || normalized === 'web-speech' || normalized === 'webspeech') {
    return 'browser';
  }
  return 'server';
}

export function getConfiguredSttProvider(): SttProviderName {
  return resolveSttProvider(process.env.NEXT_PUBLIC_STT_PROVIDER);
}

export function getBrowserSttConfig(
  environment: Record<string, string | undefined>,
): BrowserSttConfig {
  const requestedAlternatives = Number.parseInt(
    environment.NEXT_PUBLIC_BROWSER_STT_MAX_ALTERNATIVES ?? '',
    10,
  );
  const maxAlternatives = Number.isFinite(requestedAlternatives)
    ? Math.min(5, Math.max(1, requestedAlternatives))
    : 1;
  const requestedSilenceMs = Number.parseInt(
    environment.NEXT_PUBLIC_BROWSER_STT_SILENCE_MS ?? '',
    10,
  );
  const silenceMs = Number.isFinite(requestedSilenceMs)
    ? Math.min(1_500, Math.max(300, requestedSilenceMs))
    : 1_500;
  const phrases = Array.from(new Set(
    (environment.NEXT_PUBLIC_BROWSER_STT_PHRASES ?? '')
      .split(',')
      .map((phrase) => phrase.trim())
      .filter(Boolean),
  )).slice(0, 50);

  return {
    language: environment.NEXT_PUBLIC_BROWSER_STT_LANGUAGE?.trim() || 'en-US',
    continuous: parseBoolean(environment.NEXT_PUBLIC_BROWSER_STT_CONTINUOUS, true),
    interimResults: parseBoolean(environment.NEXT_PUBLIC_BROWSER_STT_INTERIM_RESULTS, true),
    maxAlternatives,
    processLocally: parseBoolean(environment.NEXT_PUBLIC_BROWSER_STT_PROCESS_LOCALLY, false),
    unspokenPunctuation: parseBoolean(
      environment.NEXT_PUBLIC_BROWSER_STT_UNSPOKEN_PUNCTUATION,
      true,
    ),
    aecMode: parseAecMode(environment.NEXT_PUBLIC_BROWSER_STT_AEC_MODE),
    autoGainControl: parseBoolean(
      environment.NEXT_PUBLIC_BROWSER_STT_AUTO_GAIN_CONTROL,
      true,
    ),
    phrases,
    silenceMs,
  };
}

export function getConfiguredBrowserSttConfig(): BrowserSttConfig {
  return getBrowserSttConfig({
    NEXT_PUBLIC_BROWSER_STT_LANGUAGE: process.env.NEXT_PUBLIC_BROWSER_STT_LANGUAGE,
    NEXT_PUBLIC_BROWSER_STT_CONTINUOUS: process.env.NEXT_PUBLIC_BROWSER_STT_CONTINUOUS,
    NEXT_PUBLIC_BROWSER_STT_INTERIM_RESULTS: process.env.NEXT_PUBLIC_BROWSER_STT_INTERIM_RESULTS,
    NEXT_PUBLIC_BROWSER_STT_MAX_ALTERNATIVES: process.env.NEXT_PUBLIC_BROWSER_STT_MAX_ALTERNATIVES,
    NEXT_PUBLIC_BROWSER_STT_PROCESS_LOCALLY: process.env.NEXT_PUBLIC_BROWSER_STT_PROCESS_LOCALLY,
    NEXT_PUBLIC_BROWSER_STT_UNSPOKEN_PUNCTUATION:
      process.env.NEXT_PUBLIC_BROWSER_STT_UNSPOKEN_PUNCTUATION,
    NEXT_PUBLIC_BROWSER_STT_AEC_MODE: process.env.NEXT_PUBLIC_BROWSER_STT_AEC_MODE,
    NEXT_PUBLIC_BROWSER_STT_AUTO_GAIN_CONTROL:
      process.env.NEXT_PUBLIC_BROWSER_STT_AUTO_GAIN_CONTROL,
    NEXT_PUBLIC_BROWSER_STT_PHRASES: process.env.NEXT_PUBLIC_BROWSER_STT_PHRASES,
    NEXT_PUBLIC_BROWSER_STT_SILENCE_MS: process.env.NEXT_PUBLIC_BROWSER_STT_SILENCE_MS,
  });
}

export function assembleBrowserSpeechEvent(event: BrowserSpeechResultEvent): {
  finals: string[];
  finalSegments: IndexedBrowserFinalSegment[];
  interim: string;
} {
  const finals: string[] = [];
  const finalSegments: IndexedBrowserFinalSegment[] = [];
  const interim: string[] = [];
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript?.trim();
    if (!transcript) continue;
    if (result.isFinal) {
      finals.push(transcript);
      finalSegments.push({ resultIndex: index, transcript });
    }
    else interim.push(transcript);
  }
  return { finals, finalSegments, interim: interim.join(' ').trim() };
}

const normalizeTranscript = (value: string): string => value.replace(/\s+/g, ' ').trim();

export function reconcileBrowserFinalSegments(
  currentSegments: readonly IndexedBrowserFinalSegment[],
  incomingSegments: readonly IndexedBrowserFinalSegment[],
): IndexedBrowserFinalSegment[] {
  const byIndex = new Map<number, string>();
  currentSegments.forEach(({ resultIndex, transcript }) => {
    const normalized = normalizeTranscript(transcript);
    if (normalized) byIndex.set(resultIndex, normalized);
  });
  incomingSegments.forEach(({ resultIndex, transcript }) => {
    const normalized = normalizeTranscript(transcript);
    if (normalized) byIndex.set(resultIndex, normalized);
  });
  return Array.from(byIndex, ([resultIndex, transcript]) => ({ resultIndex, transcript }))
    .sort((left, right) => left.resultIndex - right.resultIndex);
}

const normalizeSpeech = (value: string): string => value
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '')
  .trim();

export function isLikelyPlaybackEcho(recognized: string, activeSpeech: string): boolean {
  const heard = normalizeSpeech(recognized);
  const spoken = normalizeSpeech(activeSpeech);
  if (heard.length < 2 || spoken.length < 2) return false;
  if (heard === spoken || heard.includes(spoken)) return true;

  const lengthRatio = heard.length / spoken.length;
  if (spoken.includes(heard)) return heard.length >= 4 && lengthRatio >= 0.2;
  if (heard.length < 4 || lengthRatio < 0.2) return false;

  const grams = (value: string): Set<string> => {
    const result = new Set<string>();
    for (let index = 0; index + 1 < value.length; index += 1) {
      result.add(value.slice(index, index + 2));
    }
    return result;
  };
  const heardGrams = grams(heard);
  const spokenGrams = grams(spoken);
  let overlap = 0;
  heardGrams.forEach((gram) => {
    if (spokenGrams.has(gram)) overlap += 1;
  });
  return overlap / Math.max(1, Math.min(heardGrams.size, spokenGrams.size)) >= 0.8;
}

export function isLateBrowserFinal(
  committedText: string,
  finalText: string,
  committedAt: number,
  now: number,
  windowMs = 2_500,
): boolean {
  if (now - committedAt > windowMs) return false;
  const committed = normalizeSpeech(committedText);
  const final = normalizeSpeech(finalText);
  if (committed.length < 2 || final.length < 2) return false;
  return committed === final || committed.includes(final) || final.includes(committed);
}

export function mapBrowserSpeechError(error: string): string | null {
  if (error === 'aborted') return null;
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'MICROPHONE_DENIED';
  if (error === 'audio-capture') return 'MICROPHONE_UNAVAILABLE';
  if (error === 'no-speech') return 'STT_NO_RESULT';
  return 'STT_UNAVAILABLE';
}

export function buildBrowserTranscriptMessage(transcript: BrowserFinalTranscript): string {
  return JSON.stringify({
    type: 'user_text_message',
    text: transcript.text.trim(),
    speechEvidence: transcript.speechEvidence,
  });
}

export function buildBrowserPartialTranscriptMessage(text: string): string {
  return JSON.stringify({ type: 'browser_partial_transcript', content: text });
}
