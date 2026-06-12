import { describe, expect, it } from 'vitest';
import { calculateTierProgress } from './tierProgress';

const tiers = [
    { id: 'unranked', label: 'Unranked' },
    { id: 'bronze', label: 'Bronze' },
    { id: 'silver', label: 'Silver' },
    { id: 'gold', label: 'Gold' },
] as const;

describe('calculateTierProgress', () => {
    it('returns the first tier for an empty session', () => {
        const result = calculateTierProgress({ tiers, turnLps: [] });

        expect(result.tier.id).toBe('unranked');
        expect(result.totalLp).toBe(0);
        expect(result.lp).toBe(0);
        expect(result.progress).toBe(0);
        expect(result.latestDelta).toBe(0);
        expect(result.nextTierRemainingLp).toBe(100);
    });

    it('promotes at each 100 LP boundary', () => {
        const result = calculateTierProgress({ tiers, turnLps: [58, 42, 100] });

        expect(result.tier.id).toBe('silver');
        expect(result.totalLp).toBe(200);
        expect(result.lp).toBe(0);
        expect(result.progress).toBe(0);
        expect(result.nextTier?.id).toBe('gold');
        expect(result.nextTierRemainingLp).toBe(100);
    });

    it('keeps the highest earned tier after negative LP', () => {
        const result = calculateTierProgress({ tiers, turnLps: [60, 45, -12] });

        expect(result.tier.id).toBe('bronze');
        expect(result.highestTotalLp).toBe(105);
        expect(result.totalLp).toBe(93);
        expect(result.lp).toBe(0);
        expect(result.latestDelta).toBe(-12);
        expect(result.nextTierRemainingLp).toBe(107);
    });

    it('supports developer promotion and demotion checks with synthetic LP events', () => {
        const result = calculateTierProgress({ tiers, turnLps: [20, 100, -100] });

        expect(result.tier.id).toBe('bronze');
        expect(result.highestTotalLp).toBe(120);
        expect(result.totalLp).toBe(20);
        expect(result.lp).toBe(0);
        expect(result.latestDelta).toBe(-100);
        expect(result.nextTierRemainingLp).toBe(180);
    });

    it('does not lock a tier from a pending mission bonus', () => {
        const result = calculateTierProgress({
            tiers,
            turnLps: [96],
            pendingMissionBonus: 6,
            latestPendingMissionBonus: 6,
        });

        expect(result.tier.id).toBe('unranked');
        expect(result.highestTotalLp).toBe(96);
        expect(result.totalLp).toBe(102);
        expect(result.lp).toBe(100);
        expect(result.latestDelta).toBe(6);
        expect(result.nextTierRemainingLp).toBe(0);
    });

    it('keeps the max tier stable even if the current total drops below its start', () => {
        const result = calculateTierProgress({ tiers, turnLps: [320, -50] });

        expect(result.tier.id).toBe('gold');
        expect(result.totalLp).toBe(270);
        expect(result.lp).toBe(0);
        expect(result.progress).toBe(100);
        expect(result.nextTier).toBeNull();
        expect(result.nextTierRemainingLp).toBe(0);
    });
});
