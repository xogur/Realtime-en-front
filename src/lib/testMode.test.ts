import { describe, expect, it } from 'vitest';

import { resolveTextOnlyTestMode } from './testMode';

describe('text-only test mode', () => {
  it('can be enabled outside production', () => {
    expect(resolveTextOnlyTestMode({
      NODE_ENV: 'development',
      NEXT_PUBLIC_TEXT_ONLY_TEST_MODE: 'true',
    })).toBe(true);
  });

  it('is always disabled in production', () => {
    expect(resolveTextOnlyTestMode({
      NODE_ENV: 'production',
      NEXT_PUBLIC_TEXT_ONLY_TEST_MODE: 'true',
    })).toBe(false);
  });

  it('is opt-in', () => {
    expect(resolveTextOnlyTestMode({ NODE_ENV: 'development' })).toBe(false);
  });
});
