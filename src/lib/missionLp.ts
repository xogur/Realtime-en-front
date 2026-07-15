import type { ChatMessage, MissionCompletion, TurnEvaluation } from '@/stores/useStore';

export type MissionMetricKey = 'grammar' | 'vocabulary' | 'relevance' | 'fluency' | 'interaction';

export type MissionResult = {
    achieved: boolean;
    bonus: number;
    missionId: string;
    target: string;
    reason: string;
    title: string;
};

export type EvaluatedMissionTurn = {
    message: ChatMessage;
    evaluation: TurnEvaluation;
};

export const MISSION_GAMING_PENALTY_LP = -8;

export function clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

export function getMetricScore(evaluation: TurnEvaluation, key: MissionMetricKey | 'overall'): number {
    const value = evaluation.scores[key];
    if (Number.isFinite(value)) return clampScore(value);
    return key === 'interaction' ? getMetricScore(evaluation, 'relevance') : 0;
}

export function wordCount(text: string): number {
    return text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0;
}

export function hasExpansionCue(text: string): boolean {
    return /\b(and|but|because|so|when|if|for example)\b/i.test(text);
}

export function getMissionResultsFromCompletions(completions?: MissionCompletion[]): MissionResult[] {
    return (completions ?? []).map((mission: MissionCompletion) => ({
        achieved: true,
        bonus: mission.rewardLp,
        missionId: mission.missionId,
        target: mission.target,
        reason: mission.reason,
        title: mission.title,
    }));
}

export function getMissionBonusFromMessage(message?: ChatMessage | null): number {
    return getMissionResultsFromCompletions(message?.completedMissions).reduce((sum, mission) => sum + mission.bonus, 0);
}

export function getBaseTurnLp(turn: EvaluatedMissionTurn): number {
    const overall = getMetricScore(turn.evaluation, 'overall');
    const relevance = getMetricScore(turn.evaluation, 'relevance');
    const interaction = getMetricScore(turn.evaluation, 'interaction');
    const qualityScore = Math.round(overall * 0.55 + relevance * 0.3 + interaction * 0.15);
    const words = wordCount(turn.message.content);
    const expanded = words >= 8 || hasExpansionCue(turn.message.content);
    let delta = Math.round((qualityScore - 50) / 2.4);

    if (expanded && relevance >= 60) delta += 4;
    if (relevance <= 30) delta = Math.min(delta, MISSION_GAMING_PENALTY_LP);
    else if (relevance <= 50) delta = Math.min(delta, -4);
    if (interaction <= 45) delta -= 2;
    if (overall < 55 && words <= 3) delta -= 2;
    return Math.max(-12, Math.min(26, delta));
}

export function isMissionGamingAttempt(turn: EvaluatedMissionTurn): boolean {
    if ((turn.message.completedMissions?.length ?? 0) === 0) return false;

    const overall = getMetricScore(turn.evaluation, 'overall');
    const relevance = getMetricScore(turn.evaluation, 'relevance');
    const interaction = getMetricScore(turn.evaluation, 'interaction');

    return relevance <= 30 || interaction <= 35 || overall <= 45;
}

export function getTurnLp(turn: EvaluatedMissionTurn): number {
    const missionBonus = getMissionResultsFromCompletions(turn.message.completedMissions)
        .reduce((sum, mission) => sum + mission.bonus, 0);
    const earnedLp = Math.max(-12, Math.min(34, getBaseTurnLp(turn) + missionBonus));

    if (isMissionGamingAttempt(turn)) {
        return Math.min(earnedLp, MISSION_GAMING_PENALTY_LP);
    }

    return earnedLp;
}

export function getCurrentMessageLp(message: ChatMessage): number {
    const correctionLp = Number.isFinite(message.correction?.provisionalLp)
        ? Math.round(message.correction?.provisionalLp ?? 0)
        : 0;
    const missionBonus = getMissionBonusFromMessage(message);

    if (message.evaluation) {
        if (message.evaluation.confidence.trim().toLowerCase() === 'low') {
            return correctionLp + missionBonus;
        }
        return getTurnLp({ message, evaluation: message.evaluation });
    }

    return correctionLp + missionBonus;
}
