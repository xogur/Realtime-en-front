/** Thinking sounds; a pause after "음…" must not send that as the answer. */
export const KOREAN_FILLERS: ReadonlySet<string> = new Set([
  '음', '음음', '으음', '흠', '어', '어어', '아', '그', '저', '저기', '그러니까', '그니까', '뭐지', '뭐더라', '있잖아', '응',
]);

function bareWord(word: string): string {
  return word.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}

export function isFillerOnly(text: string): boolean {
  const words = text.normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => KOREAN_FILLERS.has(word));
}

/**
 * Drops whole filler words ("음, 2번이요" -> "2번이요") before a reply is parsed.
 * Only separate words are removed, so names and words such as "음식" or "어진" stay intact.
 * `leadingOnly` keeps fillers after the first real word (a name answer may continue "저 ...").
 */
export function stripKoreanFillers(text: string, { leadingOnly = false } = {}): string {
  const words = text.normalize('NFKC').trim().split(/\s+/).filter(Boolean);
  let leading = true;
  return words.filter((word) => {
    const filler = KOREAN_FILLERS.has(bareWord(word));
    if (!filler) leading = false;
    return !filler || (leadingOnly && !leading);
  }).join(' ');
}
