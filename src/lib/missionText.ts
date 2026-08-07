import type { SpeechEvidenceV1 } from './stt';

export type SentenceCountResult = {
  count: number;
  source: 'punctuation' | 'stt_segments' | 'none';
};

const CONTINUATION_STARTS = new Set([
  'after', 'and', 'as', 'at', 'because', 'before', 'but', 'by', 'during', 'for', 'from',
  'if', 'in', 'into', 'is', 'of', 'on', 'or', 'since', 'so', 'than', 'that', 'though',
  'through', 'until', 'when', 'which', 'who', 'with', 'without',
]);
const UNFINISHED_ENDS = new Set([
  'a', 'am', 'an', 'and', 'are', 'at', 'because', 'but', 'by', 'can', 'could', 'for',
  'from', 'had', 'has', 'have', 'in', 'into', 'is', 'may', 'might', 'must', 'of', 'on',
  'or', 'should', 'the', 'to', 'was', 'were', 'will', 'with', 'would',
]);
const LEADING_FILLERS = new Set(['ah', 'er', 'hmm', 'okay', 'uh', 'um', 'well', 'yeah']);
const COMPLEMENT_VERB_ENDS = new Set([
  'believe', 'believed', 'feel', 'felt', 'guess', 'guessed', 'hope', 'hoped', 'know',
  'knew', 'like', 'liked', 'mean', 'meant', 'realize', 'realized', 'say', 'said',
  'think', 'thought', 'want', 'wanted',
]);
const FINITE_VERBS = new Set([
  'agree', 'am', 'are', 'ate', 'bought', 'can', 'came', 'come', 'could', 'did', 'do', 'does',
  'drink', 'eat', 'enjoy', 'feel', 'felt', 'found', 'go', 'goes', 'got', 'had', 'has', 'have', 'help',
  'helps', 'is', 'know', 'knew', 'learn', 'learned', 'like', 'likes', 'live', 'love', 'made', 'make',
  'makes', 'may', 'might', 'must', 'need', 'play', 'prefer', 'read', 'seem', 'seems',
  'left', 'ran', 'said', 'saw', 'should', 'smiles', 'speak', 'speaks', 'stay', 'stayed', 'study', 'taste',
  'tastes', 'think', 'thought', 'told', 'took', 'tried', 'try', 'use', 'used', 'visit',
  'visited', 'want', 'was', 'went', 'were', 'will',
  'work', 'works', 'would',
]);
const CONTRACTION_WORDS: Record<string, string[]> = {
  "can't": ['can', 'not'],
  "couldn't": ['could', 'not'],
  "didn't": ['did', 'not'],
  "doesn't": ['does', 'not'],
  "don't": ['do', 'not'],
  "he's": ['he', 'is'],
  "i'm": ['i', 'am'],
  "i've": ['i', 'have'],
  "it's": ['it', 'is'],
  "she's": ['she', 'is'],
  "they're": ['they', 'are'],
  "we're": ['we', 'are'],
  "won't": ['will', 'not'],
  "wouldn't": ['would', 'not'],
  "you're": ['you', 'are'],
};
const CONTRACTION_PREDICATES = new Set([
  'afraid', 'angry', 'bad', 'busy', 'early', 'excited', 'fine', 'good', 'happy',
  'hungry', 'late', 'okay', 'ready', 'sad', 'sick', 'sure', 'thirsty', 'tired',
]);
const FILLER_PHRASES = new Set([
  'ah',
  'er',
  'hmm',
  'let me think',
  'uh',
  'um',
  'you know',
]);

function normalizeWhitespace(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function countWords(value: string): number {
  return normalizeWhitespace(value).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function countExplicitSentences(text: string): number {
  return text
    .normalize('NFKC')
    .split(/[.!?。！？]+|\r?\n+/)
    .filter((part) => countWords(part) > 0)
    .length;
}

function normalizedWords(value: string): string[] {
  const words = normalizeWhitespace(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  return words.flatMap((word, index) => {
    const normalized = word.replace('’', "'");
    const known = CONTRACTION_WORDS[normalized];
    if (known) return known;
    const nextWord = words[index + 1]?.toLowerCase().replace('’', "'") ?? '';
    const hasPredicateAfterName = CONTRACTION_PREDICATES.has(nextWord)
      || /^[\p{L}]+(?:ed|ing)$/u.test(nextWord);
    if (normalized.endsWith("'s") && normalized.length > 2 && hasPredicateAfterName) {
      return [normalized.slice(0, -2), 'is'];
    }
    return [word];
  });
}

function isFillerOnly(value: string): boolean {
  const normalized = normalizedWords(value).join(' ');
  return FILLER_PHRASES.has(normalized);
}

export function speechEvidenceMatchesText(text: string, evidence: SpeechEvidenceV1): boolean {
  if (evidence.version !== 1 || evidence.provider !== 'browser') return false;
  if (!Array.isArray(evidence.finalSegments) || evidence.finalSegments.length === 0) return false;
  return normalizeWhitespace(evidence.finalSegments.join(' ')) === normalizeWhitespace(text);
}

function isIndependentClause(value: string): boolean {
  const words = normalizedWords(value);
  if (words.length < 2 || LEADING_FILLERS.has(words[0])) return false;
  return words.some((word, index) => (
    index > 0 && (FINITE_VERBS.has(word) || /^[\p{L}]+ed$/u.test(word))
  ));
}

export function countQualifiedSttSegments(
  text: string,
  evidence?: SpeechEvidenceV1,
): number {
  if (!evidence || !speechEvidenceMatchesText(text, evidence)) return 0;

  const segments = evidence.finalSegments
    .map(normalizeWhitespace)
    .filter((segment) => countWords(segment) >= 2 && !isFillerOnly(segment));
  const groups: string[] = [];

  segments.forEach((segment) => {
    const words = normalizedWords(segment);
    const previous = groups.at(-1);
    const previousWords = previous ? normalizedWords(previous) : [];
    const continuesPrevious = Boolean(previous)
      && (
        CONTINUATION_STARTS.has(words[0])
        || UNFINISHED_ENDS.has(previousWords.at(-1) ?? '')
        || COMPLEMENT_VERB_ENDS.has(previousWords.at(-1) ?? '')
      );
    if (continuesPrevious) {
      groups[groups.length - 1] = `${previous} ${segment}`;
    } else {
      groups.push(segment);
    }
  });

  return groups.filter(isIndependentClause).length;
}

export function countMissionSentences(
  text: string,
  evidence?: SpeechEvidenceV1,
  allowSttSegments = true,
): SentenceCountResult {
  // Speech evidence is a client-side coaching hint, not proof for server-side rewards.
  const explicitCount = countExplicitSentences(text);
  const sttCount = allowSttSegments ? countQualifiedSttSegments(text, evidence) : 0;
  const count = Math.max(explicitCount, sttCount);
  if (explicitCount > 1 && explicitCount >= sttCount) {
    return { count, source: 'punctuation' };
  }
  if (sttCount > explicitCount) {
    return { count, source: 'stt_segments' };
  }
  return { count, source: 'none' };
}
