const TIER_LP_SIZE = 100;

type TierWithLabel = {
    label: string;
};

export type TierProgress<TTier extends TierWithLabel> = {
    tier: TTier;
    lp: number;
    totalLp: number;
    progress: number;
    latestDelta: number;
    nextTier: TTier | null;
    nextTierRemainingLp: number;
    highestTotalLp: number;
};

type TierProgressInput<TTier extends TierWithLabel> = {
    tiers: readonly TTier[];
    turnLps: readonly number[];
    pendingMissionBonus?: number;
    latestPendingMissionBonus?: number;
};

function clampLp(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value));
}

export function calculateTierProgress<TTier extends TierWithLabel>({
    tiers,
    turnLps,
    pendingMissionBonus = 0,
    latestPendingMissionBonus = 0,
}: TierProgressInput<TTier>): TierProgress<TTier> {
    if (tiers.length === 0) {
        throw new Error('calculateTierProgress requires at least one tier');
    }

    let evaluatedTotal = 0;
    let highestEvaluatedTotal = 0;

    turnLps.forEach((delta) => {
        evaluatedTotal += Number.isFinite(delta) ? Math.round(delta) : 0;
        highestEvaluatedTotal = Math.max(highestEvaluatedTotal, Math.max(0, evaluatedTotal));
    });

    const totalLp = clampLp(evaluatedTotal + pendingMissionBonus);
    const highestTotalLp = clampLp(highestEvaluatedTotal);
    const tierIndex = Math.min(tiers.length - 1, Math.floor(highestTotalLp / TIER_LP_SIZE));
    const nextTier = tiers[tierIndex + 1] ?? null;
    const currentTierStart = tierIndex * TIER_LP_SIZE;
    const nextTierStart = (tierIndex + 1) * TIER_LP_SIZE;
    const rawTierLp = totalLp - currentTierStart;
    const lp = Math.max(0, Math.min(TIER_LP_SIZE, rawTierLp));
    const latestEvaluatedDelta = turnLps.length > 0 ? Math.round(turnLps[turnLps.length - 1] ?? 0) : 0;
    const latestDelta = latestPendingMissionBonus > 0 ? Math.round(latestPendingMissionBonus) : latestEvaluatedDelta;

    return {
        tier: tiers[tierIndex],
        lp,
        totalLp,
        progress: nextTier ? lp : TIER_LP_SIZE,
        latestDelta,
        nextTier,
        nextTierRemainingLp: nextTier ? Math.max(0, nextTierStart - totalLp) : 0,
        highestTotalLp,
    };
}
