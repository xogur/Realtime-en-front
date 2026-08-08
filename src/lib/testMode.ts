export function resolveTextOnlyTestMode(
  environment: Record<string, string | undefined>,
): boolean {
  return environment.NODE_ENV !== 'production'
    && environment.NEXT_PUBLIC_TEXT_ONLY_TEST_MODE === 'true';
}

export const TEXT_ONLY_TEST_MODE = resolveTextOnlyTestMode({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_TEXT_ONLY_TEST_MODE: process.env.NEXT_PUBLIC_TEXT_ONLY_TEST_MODE,
});
