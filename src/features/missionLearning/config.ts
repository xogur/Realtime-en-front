export function resolveMissionLearningEnabled(
  environment: Record<string, string | undefined>,
): boolean {
  return environment.NEXT_PUBLIC_MISSION_LEARNING_ENABLED?.trim().toLowerCase() === 'true';
}

// Learning mode stays hidden unless the build explicitly enables it.
export const MISSION_LEARNING_ENABLED = resolveMissionLearningEnabled({
  NEXT_PUBLIC_MISSION_LEARNING_ENABLED: process.env.NEXT_PUBLIC_MISSION_LEARNING_ENABLED,
});
