/**
 * Decoding context for one Korean answer, sent to Crisper as already-heard speech: the
 * avatar's question with its choices. Measured on synthetic replies (2026-10-14): mode
 * 89 -> 94%, difficulty 81 -> 93%, names 61 -> 67%; no unrelated phrase or noise became a
 * choice. Crisper drops a repeat of the context's last words, so each one ends with the
 * question, never a choice ("…고급" as the last word turned "고급이요" into "이").
 * The browser only names a step; the server route owns these texts.
 */
export const ONBOARDING_STT_HINTS = {
  mode: '프리토킹, 학습모드, 이야기 듣기 중에서 말씀해 주세요.',
  difficulty: '초급, 중급, 고급 중 하나를 말씀해 주세요.',
  topic: '음식점, 공항, 여행, 취미, 학교, 가족, 일상 중에서 원하는 주제를 말씀해 주세요.',
  name: '이름이나 닉네임을 말씀해 주세요. 제 이름은',
} as const;

export type OnboardingSttHint = keyof typeof ONBOARDING_STT_HINTS;

export function isOnboardingSttHint(value: string | null): value is OnboardingSttHint {
  return value !== null && Object.hasOwn(ONBOARDING_STT_HINTS, value);
}
