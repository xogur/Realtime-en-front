// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { getKioskIdFromLocation } from './kioskIdentity';

describe('getKioskIdFromLocation', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('accepts the launcher kioskId query parameter', () => {
    window.history.replaceState({}, '', '/?kioskId=A02');
    expect(getKioskIdFromLocation()).toBe('A02');
  });

  // Regression: the documented/manual kiosk URL used `KioskId=A02`.
  // Found by /qa on 2026-08-21.
  it('also accepts KioskId with an uppercase K', () => {
    window.history.replaceState({}, '', '/?KioskId=A03');
    expect(getKioskIdFromLocation()).toBe('A03');
  });

  it('prefers the canonical lowercase parameter when both are supplied', () => {
    window.history.replaceState({}, '', '/?kioskId=A04&KioskId=A02');
    expect(getKioskIdFromLocation()).toBe('A04');
  });
});
