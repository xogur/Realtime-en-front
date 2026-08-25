import { describe, expect, it } from 'vitest';
import { hasPersonDetection, PERSON_DETECTION_CONFIDENCE } from './personDetection';

describe('person detection policy', () => {
  it('accepts the lower-confidence person result produced by a side profile', () => {
    // EfficientDet Lite0 returned 0.09765625 when the side profile was framed
    // in the kiosk's 640x360 (16:9) camera viewport.
    expect(PERSON_DETECTION_CONFIDENCE).toBeLessThan(0.09765625);
    expect(hasPersonDetection([
      { categories: [{ categoryName: 'person', displayName: '' }] },
    ])).toBe(true);
  });

  it('does not treat another object as a person', () => {
    expect(hasPersonDetection([
      { categories: [{ categoryName: 'cell phone', displayName: '' }] },
    ])).toBe(false);
  });

  it('accepts a translated person display name', () => {
    expect(hasPersonDetection([
      { categories: [{ categoryName: '', displayName: 'PERSON' }] },
    ])).toBe(true);
  });
});
