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

    it('protects a newly earned tier from one small negative turn', () => {
        const result = calculateTierProgress({ tiers, turnLps: [60, 45, -12] });

        expect(result.tier.id).toBe('bronze');
        expect(result.highestTotalLp).toBe(105);
        expect(result.totalLp).toBe(93);
        expect(result.lp).toBe(0);
        expect(result.latestDelta).toBe(-12);
        expect(result.nextTierRemainingLp).toBe(107);
    });

    it('demotes after two consecutive negative turns cross the protection band', () => {
        const result = calculateTierProgress({ tiers, turnLps: [60, 45, -12, -15] });

        expect(result.tier.id).toBe('unranked');
        expect(result.totalLp).toBe(78);
        expect(result.latestDelta).toBe(-15);
        expect(result.nextTier?.id).toBe('bronze');
        expect(result.nextTierRemainingLp).toBe(22);
    });

    it('supports protected developer demotion checks with synthetic LP events', () => {
        const result = calculateTierProgress({ tiers, turnLps: [20, 100, -99, -1] });

        expect(result.tier.id).toBe('unranked');
        expect(result.highestTotalLp).toBe(120);
        expect(result.totalLp).toBe(20);
        expect(result.lp).toBe(20);
        expect(result.latestDelta).toBe(-1);
        expect(result.nextTierRemainingLp).toBe(80);
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

    it('protects the max tier once, then demotes it on sustained decline', () => {
        const protectedResult = calculateTierProgress({ tiers, turnLps: [320, -50] });
        const demotedResult = calculateTierProgress({ tiers, turnLps: [320, -50, -1] });

        expect(protectedResult.tier.id).toBe('gold');
        expect(demotedResult.tier.id).toBe('silver');
        expect(demotedResult.totalLp).toBe(269);
        expect(demotedResult.lp).toBe(69);
        expect(demotedResult.nextTier?.id).toBe('gold');
        expect(demotedResult.nextTierRemainingLp).toBe(31);
    });
});
