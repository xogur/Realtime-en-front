export function resolveLessonTalkEnabled(environment: Record<string, string | undefined>): boolean {
  return environment.NEXT_PUBLIC_LESSON_TALK_ENABLED?.trim().toLowerCase() === 'true';
}

// "학습하기" runs as an avatar-led lesson talk only when the build enables it; otherwise the
// guided lesson screen on /chat stays in place.
export const LESSON_TALK_ENABLED = resolveLessonTalkEnabled({
  NEXT_PUBLIC_LESSON_TALK_ENABLED: process.env.NEXT_PUBLIC_LESSON_TALK_ENABLED,
});
