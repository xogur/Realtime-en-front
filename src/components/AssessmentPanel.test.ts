import { describe, expect, it } from 'vitest';

import { shouldShowCoachContent } from './AssessmentPanel';

describe('shouldShowCoachContent', () => {
    it('shows realtime correction before the first batch evaluation arrives', () => {
        expect(shouldShowCoachContent(0, true)).toBe(true);
    });

    it('keeps the empty state when neither correction nor evaluation exists', () => {
        expect(shouldShowCoachContent(0, false)).toBe(false);
    });

    it('shows evaluated content without a realtime correction', () => {
        expect(shouldShowCoachContent(1, false)).toBe(true);
    });
});
