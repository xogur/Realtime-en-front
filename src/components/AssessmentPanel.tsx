'use client';

import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    Printer,
    Sparkles,
    Target,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type ChatMessage, type MissionCompletion, type PracticeMission, type TurnEvaluation } from '@/stores/useStore';

type EvaluatedTurn = {
    message: ChatMessage;
    evaluation: TurnEvaluation;
};

type MetricKey = 'grammar' | 'vocabulary' | 'relevance' | 'fluency' | 'interaction';
type TierId = 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

type MetricSnapshot = { key: MetricKey; label: string; value: number };

type MissionResult = {
    achieved: boolean;
    bonus: number;
    missionId: string;
    target: string;
    reason: string;
    title: string;
};

type MissionCelebration = {
    id: string;
    targets: string[];
    bonus: number;
};

const MISSION_CELEBRATION_VISIBLE_MS = 4000;

type TierConfig = {
    id: TierId;
    label: string;
    subtitle: string;
    from: string;
    via: string;
    to: string;
    stroke: string;
    text: string;
    glow: string;
    symbol: 'dot' | 'star' | 'book' | 'mic' | 'spark' | 'gem' | 'crown';
};

const METRICS: Array<{ key: MetricKey; label: string }> = [
    { key: 'grammar', label: '문법' },
    { key: 'vocabulary', label: '어휘' },
    { key: 'relevance', label: '맥락' },
    { key: 'fluency', label: '유창성' },
    { key: 'interaction', label: '상호작용' },
];

const TIERS: TierConfig[] = [
    {
        id: 'unranked',
        label: '언랭크',
        subtitle: '첫 대화를 시작하는 단계',
        from: '#f2eee8',
        via: '#dad2c8',
        to: '#a79b90',
        stroke: '#7f7469',
        text: '#5b5249',
        glow: 'shadow-[#8d8175]/20',
        symbol: 'dot',
    },
    {
        id: 'bronze',
        label: '브론즈',
        subtitle: '기본 답변 습관 형성',
        from: '#f5d0a6',
        via: '#c78346',
        to: '#7b4a28',
        stroke: '#8a512b',
        text: '#5b321b',
        glow: 'shadow-[#b56b36]/30',
        symbol: 'star',
    },
    {
        id: 'silver',
        label: '실버',
        subtitle: '짧은 문장을 안정적으로 구사',
        from: '#f7fbff',
        via: '#b8c4cf',
        to: '#6f8091',
        stroke: '#718293',
        text: '#405060',
        glow: 'shadow-[#8da0b2]/30',
        symbol: 'book',
    },
    {
        id: 'gold',
        label: '골드',
        subtitle: '자신감 있게 대화를 확장',
        from: '#fff2ad',
        via: '#e2ad37',
        to: '#9a6a18',
        stroke: '#b77f1e',
        text: '#60410e',
        glow: 'shadow-[#d8a02e]/35',
        symbol: 'mic',
    },
    {
        id: 'platinum',
        label: '플래티넘',
        subtitle: '자연스럽고 균형 잡힌 응답',
        from: '#f0fffb',
        via: '#8ed8d0',
        to: '#3f8e91',
        stroke: '#4d9fa0',
        text: '#256568',
        glow: 'shadow-[#68c7c2]/40',
        symbol: 'spark',
    },
    {
        id: 'diamond',
        label: '다이아',
        subtitle: '정교하고 풍부한 표현',
        from: '#eef8ff',
        via: '#77c8f2',
        to: '#4669c8',
        stroke: '#4c78d6',
        text: '#284a9b',
        glow: 'shadow-[#69b9ed]/50',
        symbol: 'gem',
    },
    {
        id: 'master',
        label: '마스터',
        subtitle: '깊이 있고 주도적인 회화',
        from: '#fff4bd',
        via: '#7054d8',
        to: '#171d4f',
        stroke: '#d6b84c',
        text: '#2a225f',
        glow: 'shadow-[#7d64e8]/55',
        symbol: 'crown',
    },
];

function clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function getMetricScore(evaluation: TurnEvaluation, key: MetricKey | 'overall'): number {
    const value = evaluation.scores[key];
    if (Number.isFinite(value)) return clampScore(value);
    return key === 'interaction' ? getMetricScore(evaluation, 'relevance') : 0;
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function calculateWeightedSessionScore(turns: EvaluatedTurn[]): number | null {
    if (turns.length === 0) return null;

    const recentTurns = turns.slice(-8);
    let weightedTotal = 0;
    let totalWeight = 0;

    recentTurns.forEach((turn, index) => {
        const weight = index + 1;
        const overall = getMetricScore(turn.evaluation, 'overall');
        const relevance = getMetricScore(turn.evaluation, 'relevance');
        const interaction = getMetricScore(turn.evaluation, 'interaction');
        weightedTotal += (overall * 0.72 + relevance * 0.16 + interaction * 0.12) * weight;
        totalWeight += weight;
    });

    return clampScore(weightedTotal / totalWeight);
}

function wordCount(text: string): number {
    return text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0;
}

function hasExpansionCue(text: string): boolean {
    return /\b(and|but|because|so|when|if|for example)\b/i.test(text);
}

function getTurnWeakestMetric(evaluation: TurnEvaluation): MetricSnapshot {
    return METRICS.map(({ key, label }) => ({
        key,
        label,
        value: getMetricScore(evaluation, key),
    })).reduce((weakest, metric) => (metric.value < weakest.value ? metric : weakest));
}

/*
function isMetricKey(value: string): value is MetricKey {
    return METRICS.some((metric) => metric.key === value);
}

function getMissionResult(turn: EvaluatedTurn): MissionResult {
    const mission = turn.message.attemptedMission;
    if (!mission || !isMetricKey(mission.metricKey)) {
        return {
            achieved: false,
            bonus: 0,
            target: '첫 답변을 평가한 뒤 다음 미션이 정해집니다.',
            reason: '다음 답변부터 미션 달성 LP를 받을 수 있습니다.',
        };
    }

    const previousScore = mission.baselineScore;
    const currentScore = getMetricScore(turn.evaluation, mission.metricKey);
    const improved = currentScore >= previousScore + 5;
    const stableStrong = currentScore >= 75 && currentScore >= previousScore;
    const words = wordCount(turn.message.content);
    const expanded = words >= 8 || hasExpansionCue(turn.message.content);

    const currentRelevance = getMetricScore(turn.evaluation, 'relevance');
    const achievedByMetric =
        mission.metricKey === 'interaction'
            ? /[?？]\s*$/.test(turn.message.content.trim()) || /\b(what|how|why|when|where|who|can|could|would|do|does|did|is|are)\b/i.test(turn.message.content)
            : mission.metricKey === 'fluency'
                ? expanded
                : mission.metricKey === 'vocabulary'
                    ? words >= 6 && (improved || stableStrong)
                    : improved || stableStrong;

    const achieved = currentRelevance >= 60 && (achievedByMetric || (improved && expanded));
    const bonus = achieved ? (improved && expanded ? 7 : 5) : 0;

    return {
        achieved,
        bonus,
        target: mission.target,
        reason: achieved
            ? `${mission.metricLabel} 미션을 반영했습니다. 기본 LP에 +${bonus} LP가 추가됩니다.`
            : `${mission.metricLabel} 미션은 아직 미달성입니다. 다음 답변에서 목표를 다시 시도해보세요.`,
    };
}

*/

function getMissionResultsFromCompletions(completions?: MissionCompletion[]): MissionResult[] {
    return (completions ?? []).map((mission: MissionCompletion) => ({
        achieved: true,
        bonus: mission.rewardLp,
        missionId: mission.missionId,
        target: mission.target,
        reason: mission.reason,
        title: mission.title,
    }));
}

function getMissionResults(turn: EvaluatedTurn): MissionResult[] {
    return getMissionResultsFromCompletions(turn.message.completedMissions);
}

function getMissionBonusFromMessage(message?: ChatMessage | null): number {
    return getMissionResultsFromCompletions(message?.completedMissions).reduce((sum, mission) => sum + mission.bonus, 0);
}

function getBaseTurnLp(turn: EvaluatedTurn): number {
    const overall = getMetricScore(turn.evaluation, 'overall');
    const relevance = getMetricScore(turn.evaluation, 'relevance');
    const interaction = getMetricScore(turn.evaluation, 'interaction');
    const qualityScore = Math.round(overall * 0.55 + relevance * 0.3 + interaction * 0.15);
    const words = wordCount(turn.message.content);
    const expanded = words >= 8 || hasExpansionCue(turn.message.content);
    let delta = Math.round((qualityScore - 55) / 2.8);

    if (expanded && relevance >= 60) delta += 3;
    if (relevance <= 30) delta = Math.min(delta, -8);
    else if (relevance <= 50) delta = Math.min(delta, -5);
    if (interaction <= 45) delta -= 2;
    if (overall < 55 && words <= 3) delta -= 2;
    return Math.max(-12, Math.min(22, delta));
}

function getTurnLp(turn: EvaluatedTurn): number {
    const missionBonus = getMissionResults(turn).reduce((sum, mission) => sum + mission.bonus, 0);
    return Math.max(-12, Math.min(34, getBaseTurnLp(turn) + missionBonus));
}

function getTierProgress(turns: EvaluatedTurn[], pendingMissionBonus = 0, latestPendingMissionBonus = 0) {
    const totalLp = turns.reduce((sum, turn) => sum + getTurnLp(turn), 0) + pendingMissionBonus;
    const normalized = Math.max(0, totalLp);
    const tierIndex = Math.min(TIERS.length - 1, Math.floor(normalized / 100));
    const currentTierStart = tierIndex * 100;
    const rawLp = normalized - currentTierStart;
    const hasNextTier = Boolean(TIERS[tierIndex + 1]);

    return {
        tier: TIERS[tierIndex],
        lp: hasNextTier ? rawLp : Math.min(100, rawLp),
        totalLp: normalized,
        progress: hasNextTier ? Math.min(100, rawLp) : 100,
        latestDelta: latestPendingMissionBonus > 0 ? latestPendingMissionBonus : turns.length > 0 ? getTurnLp(turns[turns.length - 1]) : 0,
        nextTier: TIERS[tierIndex + 1] ?? null,
    };
}

function getScoreTone(score: number | null): string {
    if (score === null) return '대화 시작';
    if (score >= 85) return '강함';
    if (score >= 70) return '안정적';
    if (score >= 50) return '연습 중';
    return '집중 필요';
}

function getScoreAccent(score: number): string {
    if (score >= 85) return 'bg-[#edf5ed] text-[#29452c]';
    if (score >= 70) return 'bg-[#eef8f6] text-[#1f4f4a]';
    if (score >= 50) return 'bg-[#fff7e8] text-[#7a5a23]';
    return 'bg-[#f7ece8] text-[#7a4b3a]';
}

function getLatestFocus(evaluation: TurnEvaluation): string {
    return evaluation.feedback.improvement || evaluation.feedback.summary || evaluation.evidence.overall;
}

function getRetrySentence(turn: EvaluatedTurn): string {
    return turn.evaluation.correction.suggested || turn.message.content;
}

function getCoachReason(evaluation: TurnEvaluation): string {
    return evaluation.correction.reason || evaluation.evidence.overall || evaluation.cefrEstimate.reason;
}

/*
function getPracticeMission(
    evaluation: TurnEvaluation,
    weakestMetric?: MetricSnapshot | null,
    assistantPrompt?: string,
): string {
    if (assistantPrompt?.trim()) {
        if (weakestMetric?.key === 'vocabulary') return '방금 질문에 답하면서 구체적인 단어 하나와 예시를 붙여보세요.';
        if (weakestMetric?.key === 'grammar') return '방금 질문에 답하면서 주어와 동사를 분명히 넣어 한 문장으로 말해보세요.';
        if (weakestMetric?.key === 'fluency') return '방금 질문에 답하면서 끊지 말고 한 문장으로 이어서 말해보세요.';
        if (weakestMetric?.key === 'interaction') return '방금 질문에 답한 뒤 상대에게 되묻는 질문을 하나 붙여보세요.';
        return '방금 질문의 핵심에 바로 답한 뒤 because로 이유를 한 문장 붙여보세요.';
    }
    if (evaluation.feedback.nextPractice) return evaluation.feedback.nextPractice;
    if (weakestMetric?.key === 'vocabulary') return '같은 뜻을 더 구체적인 단어 하나로 바꿔서 다시 말해보세요.';
    if (weakestMetric?.key === 'grammar') return '주어와 동사를 분명히 넣고 같은 뜻을 다시 말해보세요.';
    if (weakestMetric?.key === 'fluency') return '짧게 끊지 말고 한 문장으로 이어서 다시 말해보세요.';
    if (weakestMetric?.key === 'interaction') return '마지막에 상대에게 묻는 질문을 하나 붙여보세요.';
    return '답변 끝에 because, for example, so 중 하나를 붙여 한 문장 더 확장해보세요.';
}

function getLatestAssistantPrompt(messages: ChatMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === 'assistant') {
            return message.content.split('\n\n한국어 해석:')[0]?.trim() ?? message.content.trim();
        }
    }
    return '';
}

function getAssistantPromptAfterTurn(messages: ChatMessage[], turnId: string): string {
    const sourceIndex = messages.findIndex((message) => message.role === 'user' && message.id === turnId);
    if (sourceIndex < 0) return getLatestAssistantPrompt(messages);

    for (let index = sourceIndex + 1; index < messages.length; index += 1) {
        const message = messages[index];
        if (message.role === 'assistant') {
            return message.content.split('\n\n한국어 해석:')[0]?.trim() ?? message.content.trim();
        }
    }

    return getLatestAssistantPrompt(messages);
}

function createPracticeMission(turn: EvaluatedTurn, assistantPrompt: string): PracticeMission {
    const weakest = getTurnWeakestMetric(turn.evaluation);
    return {
        id: `${turn.evaluation.turnId}:${weakest.key}:${assistantPrompt.slice(0, 32)}`,
        sourceTurnId: turn.evaluation.turnId,
        target: getPracticeMission(turn.evaluation, weakest, assistantPrompt),
        metricKey: weakest.key,
        metricLabel: weakest.label,
        baselineScore: weakest.value,
        createdAt: new Date().toISOString(),
    };
}

*/

function missionSeed(text: string): number {
    return Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function cleanAssistantPrompt(content: string): string {
    return content.split('\n\n한국어 해석:')[0]?.trim() ?? content.trim();
}

function getLatestAssistantPrompt(messages: ChatMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === 'assistant') {
            return cleanAssistantPrompt(message.content);
        }
    }
    return '';
}

function getAssistantPromptAfterTurn(messages: ChatMessage[], turnId: string): string {
    const sourceIndex = messages.findIndex((message) => message.role === 'user' && message.id === turnId);
    if (sourceIndex < 0) return getLatestAssistantPrompt(messages);

    for (let index = sourceIndex + 1; index < messages.length; index += 1) {
        const message = messages[index];
        if (message.role === 'assistant') {
            return cleanAssistantPrompt(message.content);
        }
    }

    return getLatestAssistantPrompt(messages);
}

function createFallbackPracticeMissions(turn: EvaluatedTurn, assistantPrompt: string): PracticeMission[] {
    const weakest = getTurnWeakestMetric(turn.evaluation);
    const seed = missionSeed(`${turn.evaluation.turnId}:${assistantPrompt}:${weakest.key}`);
    const createdAt = new Date().toISOString();
    const pool: PracticeMission[] = [
        {
            id: `${turn.evaluation.turnId}:connector`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'connector',
            title: 'Reason Builder',
            target: 'Use because, so, but, or for example in your next answer.',
            successHint: 'A connector made the answer more complete.',
            rewardLp: 6,
            checks: [{ type: 'connector' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:length`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'length',
            title: 'Longer Turn',
            target: 'Answer with at least eight English words.',
            successHint: 'The answer had enough length to practice fluency.',
            rewardLp: 5,
            checks: [{ type: 'minWords', min: 8 }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:question`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'question',
            title: 'Keep Talking',
            target: 'Add one question to keep the conversation moving.',
            successHint: 'A follow-up question kept the conversation active.',
            rewardLp: 7,
            checks: [{ type: 'question' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:past`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'tense',
            title: 'Past Tense',
            target: 'Use one past-tense expression like went, did, was, or a verb ending in -ed.',
            successHint: 'Past tense was used in the answer.',
            rewardLp: 6,
            checks: [{ type: 'pastTense' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:future`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'tense',
            title: 'Future Plan',
            target: 'Use a future expression like will, going to, or plan to.',
            successHint: 'A future expression was used naturally.',
            rewardLp: 6,
            checks: [{ type: 'futureTense' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:polite`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'interaction',
            title: 'Polite Request',
            target: 'Use a polite request with can you, could you, would you, or please.',
            successHint: 'A polite request pattern was included.',
            rewardLp: 7,
            checks: [{ type: 'politeRequest' }],
            createdAt,
        },
    ];

    if (weakest.key === 'vocabulary') {
        pool.unshift({
            id: `${turn.evaluation.turnId}:example`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: 'Example Detail',
            target: 'Add one concrete example with for example or like.',
            successHint: 'The answer included a concrete example.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['for example', 'like'] }],
            matchMode: 'any',
            createdAt,
        });
    }

    const start = seed % pool.length;
    return [...pool.slice(start), ...pool.slice(0, start)].slice(0, 3);
}

function getPracticeMissionCandidates(turn: EvaluatedTurn, assistantPrompt: string): PracticeMission[] {
    const fallbackMissions = createFallbackPracticeMissions(turn, assistantPrompt);
    if (turn.evaluation.missionCandidates?.length) {
        const seen = new Set<string>();
        return [
            ...turn.evaluation.missionCandidates.map((mission) => ({
                ...mission,
                sourceTurnId: mission.sourceTurnId ?? turn.evaluation.turnId,
                createdAt: mission.createdAt ?? new Date().toISOString(),
            })),
            ...fallbackMissions,
        ].filter((mission) => {
            const key = `${mission.kind}:${mission.target.trim().toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    return fallbackMissions;
}

function usePrefersReducedMotion(): boolean {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setPrefersReducedMotion(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    return prefersReducedMotion;
}

function playMissionClearSound() {
    try {
        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass || document.visibilityState !== 'visible') return;
        const audioContext = new AudioContextClass();
        const startAt = audioContext.currentTime + 0.01;
        const notes = [659.25, 880, 1174.66];

        notes.forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const noteStart = startAt + index * 0.075;

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, noteStart);
            gain.gain.setValueAtTime(0.0001, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.045, noteStart + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.16);
            oscillator.connect(gain).connect(audioContext.destination);
            oscillator.start(noteStart);
            oscillator.stop(noteStart + 0.18);
        });

        window.setTimeout(() => void audioContext.close().catch(() => undefined), 650);
    } catch {
        // Browsers can block audio until a user gesture; mission success should still render.
    }
}

function getCelebrationParticles(id: string) {
    const seed = missionSeed(id);
    return Array.from({ length: 12 }, (_, index) => {
        const angle = ((seed + index * 29) % 120) - 60;
        const distance = 34 + ((seed + index * 13) % 52);
        return {
            id: `${id}:${index}`,
            left: 18 + ((seed + index * 17) % 64),
            color: ['#d9ff66', '#f8ff8a', '#22e3a8', '#ffffff'][index % 4],
            x: Math.sin((angle * Math.PI) / 180) * distance,
            y: -24 - ((seed + index * 11) % 46),
        };
    });
}

function ActiveMissionsPanel({ missions }: { missions: PracticeMission[] }) {
    if (missions.length === 0) return null;

    return (
        <section className="max-h-[230px] shrink-0 overflow-hidden rounded-lg border border-[#483c2d]/10 bg-white/80 p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex items-center gap-1 text-xs font-black uppercase tracking-normal text-[#6b5a4a]/70">
                        <Target className="h-3.5 w-3.5" />
                        진행 중 미션
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#483c2d]">조건에 맞는 발화를 하면 즉시 성공합니다.</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f1eadf] px-2.5 py-1 text-xs font-black text-[#6b5a4a]">{missions.length}/3</span>
            </div>
            <div className="mt-3 grid max-h-[160px] gap-2 overflow-y-auto pr-1">
                {missions.map((mission) => (
                    <div key={mission.id} className="rounded-md border border-[#483c2d]/10 bg-[#fffaf5]/90 px-3 py-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#edf5ed] px-2 py-0.5 text-[11px] font-black text-[#29452c]">
                                {mission.title}
                            </span>
                            <span className="text-[11px] font-black text-[#3d6f4a]">+{mission.rewardLp} LP</span>
                        </div>
                        <p className="mt-1 break-words text-sm font-black leading-snug text-[#483c2d]">
                            {mission.target}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function getWeakestMetric(metrics: MetricSnapshot[]) {
    return metrics.reduce((weakest, metric) => (metric.value < weakest.value ? metric : weakest), metrics[0]);
}

function TierSymbol({ tier }: { tier: TierConfig }) {
    const common = { fill: 'none', stroke: '#fff8dc', strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

    if (tier.symbol === 'dot') {
        return (
            <>
                <circle cx="64" cy="61" r="10" fill="#fff8dc" opacity="0.9" />
                <path d="M48 82h32" {...common} opacity="0.55" />
            </>
        );
    }

    if (tier.symbol === 'star') {
        return <path d="m64 38 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2 7-15Z" fill="#fff8dc" opacity="0.95" />;
    }

    if (tier.symbol === 'book') {
        return (
            <>
                <path d="M43 42h16c4 0 5 3 5 6v36c0-3-2-6-7-6H43V42Z" {...common} />
                <path d="M85 42H69c-4 0-5 3-5 6v36c0-3 2-6 7-6h14V42Z" {...common} />
                <path d="M52 54h7M52 65h7M70 54h7M70 65h7" {...common} strokeWidth={2.6} opacity="0.75" />
            </>
        );
    }

    if (tier.symbol === 'mic') {
        return (
            <>
                <rect x="53" y="34" width="22" height="36" rx="11" {...common} />
                <path d="M43 58c0 13 9 22 21 22s21-9 21-22M64 80v13M53 93h22" {...common} />
            </>
        );
    }

    if (tier.symbol === 'spark') {
        return (
            <>
                <path d="M64 29 70 51l21 7-21 7-6 22-7-22-21-7 21-7 7-22Z" fill="#fff8dc" />
                <path d="M89 31v13M82 38h14M39 76v11M33 81h12" {...common} strokeWidth={3} opacity="0.8" />
            </>
        );
    }

    if (tier.symbol === 'gem') {
        return (
            <>
                <path d="M43 42h42l11 18-32 34-32-34 11-18Z" fill="#fff8dc" opacity="0.95" />
                <path d="M43 42 64 94M85 42 64 94M32 60h64M52 42l-9 18M76 42l9 18" fill="none" stroke={tier.stroke} strokeWidth="2.4" opacity="0.48" />
            </>
        );
    }

    return (
        <>
            <path d="M39 81h50l-6 14H45l-6-14Z" fill="#fff8dc" />
            <path d="m40 76 8-33 16 22 16-22 8 33H40Z" fill="#fff8dc" opacity="0.96" />
            <path d="M48 43 40 33M64 65V31M80 43l8-10" fill="none" stroke="#fff8dc" strokeWidth="4" strokeLinecap="round" />
            <circle cx="40" cy="33" r="4" fill="#fff8dc" />
            <circle cx="64" cy="31" r="4" fill="#fff8dc" />
            <circle cx="88" cy="33" r="4" fill="#fff8dc" />
        </>
    );
}

function TierBadge({ tier, size = 104 }: { tier: TierConfig; size?: number }) {
    const gradientId = `tier-gradient-${tier.id}`;
    const shineId = `tier-shine-${tier.id}`;
    const ornate = ['gold', 'platinum', 'diamond', 'master'].includes(tier.id);
    const elite = ['diamond', 'master'].includes(tier.id);

    return (
        <div className={`relative shrink-0 rounded-full shadow-2xl ${tier.glow}`} style={{ width: size, height: size }}>
            <svg viewBox="0 0 128 128" role="img" aria-label={`${tier.label} 티어 배지`} className="h-full w-full">
                <defs>
                    <radialGradient id={gradientId} cx="35%" cy="22%" r="78%">
                        <stop offset="0%" stopColor={tier.from} />
                        <stop offset="48%" stopColor={tier.via} />
                        <stop offset="100%" stopColor={tier.to} />
                    </radialGradient>
                    <linearGradient id={shineId} x1="20" y1="18" x2="108" y2="112">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.78" />
                        <stop offset="42%" stopColor="#ffffff" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                    <filter id={`tier-glow-${tier.id}`} x="-35%" y="-35%" width="170%" height="170%">
                        <feGaussianBlur stdDeviation={elite ? '4.5' : '2.5'} result="blur" />
                        <feColorMatrix
                            in="blur"
                            type="matrix"
                            values="1 0 0 0 0.9  0 1 0 0 0.8  0 0 1 0 0.45  0 0 0 0.5 0"
                        />
                        <feMerge>
                            <feMergeNode />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {elite && <circle cx="64" cy="64" r="55" fill={`url(#${gradientId})`} opacity="0.22" filter={`url(#tier-glow-${tier.id})`} />}
                <path d="M64 7 105 29v44c0 26-19 42-41 50-22-8-41-24-41-50V29L64 7Z" fill={`url(#${gradientId})`} stroke={tier.stroke} strokeWidth="5" />
                <path d="M64 18 95 35v35c0 19-13 32-31 39-18-7-31-20-31-39V35l31-17Z" fill="none" stroke="#fff8dc" strokeOpacity="0.34" strokeWidth="3" />
                <path d="M34 32c19-13 43-15 63-1-13 2-39 9-64 31V35l1-3Z" fill={`url(#${shineId})`} opacity="0.72" />

                {ornate && (
                    <>
                        <path d="M23 72c-8-8-10-18-6-27M105 72c8-8 10-18 6-27" fill="none" stroke={tier.stroke} strokeWidth="3" strokeLinecap="round" opacity="0.68" />
                        <path d="M18 47c7 1 13 4 18 10M110 47c-7 1-13 4-18 10" fill="none" stroke="#fff8dc" strokeWidth="2" strokeLinecap="round" opacity="0.58" />
                    </>
                )}

                {elite && (
                    <>
                        <path d="M27 22 31 32 42 35 31 38 27 49 23 38 12 35 23 32 27 22ZM101 16l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" fill="#fff8dc" opacity="0.9" />
                        <path d="M104 88 107 95 114 98 107 101 104 108 101 101 94 98 101 95 104 88Z" fill="#fff8dc" opacity="0.72" />
                    </>
                )}

                <TierSymbol tier={tier} />
            </svg>
        </div>
    );
}

function MiniTierBadge({ tier }: { tier: TierConfig }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <TierBadge tier={tier} size={38} />
            <span className="text-[10px] font-bold text-[#6b5a4a]/75">{tier.label}</span>
        </div>
    );
}

function MetricBar({ label, value }: { label: string; value: number }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[#483c2d]">
                <span>{label}</span>
                <span>{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#483c2d]/10">
                <div className="h-full rounded-full bg-[#6b5a4a] transition-all duration-500" style={{ width: `${clampScore(value)}%` }} />
            </div>
        </div>
    );
}

function StatusLine({ pendingCount, unavailableMessages }: { pendingCount: number; unavailableMessages: ChatMessage[] }) {
    if (pendingCount > 0) {
        return (
            <div className="flex items-center gap-2 rounded-md bg-[#fff7e8] px-3 py-2 text-xs font-medium text-[#6b5a4a]">
                <Clock className="h-4 w-4" />
                <span>{pendingCount}개 답변을 평가 중입니다.</span>
            </div>
        );
    }

    if (unavailableMessages.length > 0) {
        const codes = Array.from(new Set(unavailableMessages.map((message) => message.evaluationErrorCode).filter(Boolean)));
        return (
            <div className="flex items-center gap-2 rounded-md bg-[#f7ece8] px-3 py-2 text-xs font-medium text-[#7a4b3a]">
                <AlertCircle className="h-4 w-4" />
                <span>
                    {unavailableMessages.length}개 답변은 평가하지 못했습니다.
                    {codes.length > 0 ? ` 원인: ${codes.join(', ')}` : ''}
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 rounded-md bg-[#edf5ed] px-3 py-2 text-xs font-medium text-[#496348]">
            <CheckCircle2 className="h-4 w-4" />
            <span>자동 평가 준비 완료</span>
        </div>
    );
}

function MissionSuccessCelebration({ celebrations }: { celebrations: MissionCelebration[] }) {
    const prefersReducedMotion = usePrefersReducedMotion();

    return (
        <div
            className="pointer-events-none absolute left-1/2 top-16 z-50 flex w-[min(92%,420px)] -translate-x-1/2 flex-col gap-2 print:hidden"
            role="status"
            aria-live="polite"
        >
            <AnimatePresence initial={false}>
                {celebrations.map((celebration) => {
                    const particles = !prefersReducedMotion ? getCelebrationParticles(celebration.id) : [];

                    return (
                <motion.div
                    layout
                    key={celebration.id}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : -18, scale: prefersReducedMotion ? 1 : 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -14, scale: prefersReducedMotion ? 1 : 0.96 }}
                    transition={prefersReducedMotion ? { duration: 0.16 } : { type: 'spring', stiffness: 360, damping: 24 }}
                >
                    <div className="relative overflow-hidden rounded-lg border border-[#d9ff66]/70 bg-[#17241b]/95 px-4 py-3 text-white shadow-[0_18px_42px_rgba(22,34,24,0.34)]">
                        {particles.map((particle) => (
                            <motion.span
                                key={particle.id}
                                aria-hidden="true"
                                className="absolute top-12 h-2 w-2 rounded-[2px]"
                                style={{ left: `${particle.left}%`, backgroundColor: particle.color }}
                                initial={{ opacity: 0, x: 0, y: 0, rotate: 0 }}
                                animate={{ opacity: [0, 1, 0], x: particle.x, y: particle.y, rotate: 180 }}
                                transition={{ duration: 0.72, ease: 'easeOut' }}
                            />
                        ))}
                        <motion.div
                            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#7cff3a] via-[#f8ff5a] to-[#22e3a8]"
                            initial={{ scaleX: 0, transformOrigin: 'left' }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.55, ease: 'easeOut' }}
                        />
                        <div className="relative flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#d9ff66] text-[#17241b] shadow-[0_0_18px_rgba(217,255,102,0.55)]">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-normal text-[#d9ff66]">미션 성공</span>
                                    <span className="rounded-full bg-white/12 px-2 py-0.5 text-xs font-black text-[#f8ff8a]">+{celebration.bonus} LP</span>
                                </div>
                                <div className="mt-1 space-y-1">
                                    {celebration.targets.map((target, index) => (
                                        <p key={`${target}:${index}`} className="break-words text-sm font-black leading-snug text-white">
                                            {target}
                                        </p>
                                    ))}
                                </div>
                                <p className="mt-1 text-xs font-semibold text-white/72">
                                    방금 발화가 진행 중 미션 조건과 일치했습니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}

function FeedbackCard({ turn, compact = false }: { turn: EvaluatedTurn; compact?: boolean }) {
    const evaluation = turn.evaluation;
    const score = getMetricScore(evaluation, 'overall');
    const correction = evaluation.correction.suggested;
    const reason = evaluation.evidence.overall || evaluation.correction.reason;

    return (
        <article className="min-w-0 rounded-md border-l-4 border-[#6b5a4a]/30 bg-[#fdf8f4]/85 p-3">
            <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-xs font-bold leading-relaxed text-[#483c2d]">{turn.message.content}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black ${getScoreAccent(score)}`}>{score}점</span>
            </div>
            <p className="mt-2 break-words text-xs leading-relaxed text-[#6b5a4a]">{evaluation.feedback.summary}</p>
            {correction && (
                <p className="mt-2 break-words rounded-md bg-[#edf5ed] px-2 py-1.5 text-xs leading-relaxed text-[#334d35]">
                    <span className="font-bold">교정:</span> {correction}
                </p>
            )}
            {!compact && reason && (
                <p className="mt-2 break-words text-xs leading-relaxed text-[#265651]">
                    <span className="font-bold">근거:</span> {reason}
                </p>
            )}
        </article>
    );
}

function PrintReport({
    turns,
    sessionScore,
}: {
    turns: EvaluatedTurn[];
    sessionScore: number | null;
}) {
    const recentTurns = turns.slice(-8).reverse();

    return (
        <section className="print-document hidden bg-white text-[#2f261e]">
            <header className="border-b-4 border-[#6b5a4a] pb-5">
                <p className="text-xs font-bold uppercase tracking-normal text-[#8a6f5a]">English Speaking Evaluation</p>
                <h1 className="mt-2 text-3xl font-black tracking-normal text-[#2f261e]">English Coach Report</h1>
                <p className="mt-2 text-sm font-semibold text-[#6b5a4a]">현재 점수 {sessionScore ?? '--'} / 100</p>
            </header>
            <div className="mt-4 space-y-3">
                {recentTurns.map((turn) => (
                    <FeedbackCard key={turn.evaluation.turnId} turn={turn} />
                ))}
            </div>
        </section>
    );
}

export function AssessmentPanel() {
    const messages = useStore((state) => state.messages);
    const activeMissions = useStore((state) => state.activeMissions);
    const addMissionCandidates = useStore((state) => state.addMissionCandidates);
    const [missionCelebrations, setMissionCelebrations] = useState<MissionCelebration[]>([]);
    const shownMissionCelebrationIds = useRef<Set<string>>(new Set());
    const missionCelebrationTimers = useRef<Map<string, number>>(new Map());
    const publishedMissionTurnIds = useRef<Set<string>>(new Set());

    const assessment = useMemo(() => {
        const userMessages = messages.filter((message) => message.role === 'user');
        const latestUserMessage = userMessages[userMessages.length - 1] ?? null;
        const turns: EvaluatedTurn[] = userMessages
            .filter((message): message is ChatMessage & { evaluation: TurnEvaluation } => Boolean(message.evaluation))
            .map((message) => ({ message, evaluation: message.evaluation }));
        const latestTurn = turns[turns.length - 1] ?? null;
        const previousTurn = turns[turns.length - 2] ?? null;
        const sessionScore = calculateWeightedSessionScore(turns);
        const trend = latestTurn && previousTurn
            ? getMetricScore(latestTurn.evaluation, 'overall') - getMetricScore(previousTurn.evaluation, 'overall')
            : 0;
        const metricAverages = METRICS.map(({ key, label }) => ({
            key,
            label,
            value: average(turns.map((turn) => getMetricScore(turn.evaluation, key))),
        }));

        return {
            userMessages,
            turns,
            latestTurn,
            latestUserMessage,
            latestAssistantPrompt: getLatestAssistantPrompt(messages),
            sessionScore,
            trend,
            metricAverages,
            pendingCount: userMessages.filter((message) => message.evaluationStatus === 'pending').length,
            unavailableMessages: userMessages.filter((message) => message.evaluationStatus === 'unavailable'),
        };
    }, [messages]);

    const { userMessages, turns, latestTurn, latestUserMessage, sessionScore, metricAverages, pendingCount, unavailableMessages } = assessment;
    const previousTurns = turns.slice(0, -1).reverse();
    const weakestMetric = metricAverages.length > 0 ? getWeakestMetric(metricAverages) : null;
    const pendingMissionBonus = userMessages
        .filter((message) => !message.evaluation)
        .reduce((sum, message) => sum + getMissionBonusFromMessage(message), 0);
    const latestPendingMissionBonus = latestUserMessage && !latestUserMessage.evaluation
        ? getMissionBonusFromMessage(latestUserMessage)
        : 0;
    const tier = getTierProgress(turns, pendingMissionBonus, latestPendingMissionBonus);
    const latestMissionMessage = [...userMessages]
        .reverse()
        .find((message) => (message.completedMissions?.length ?? 0) > 0) ?? null;
    const latestMissionMessageIndex = latestMissionMessage ? userMessages.indexOf(latestMissionMessage) : -1;
    const latestMissionResults = useMemo(
        () => latestMissionMessage
            ? getMissionResultsFromCompletions(latestMissionMessage.completedMissions)
            : [],
        [latestMissionMessage],
    );
    const latestMissionBonus = latestMissionResults.reduce((sum, mission) => sum + mission.bonus, 0);
    const latestMissionId = latestMissionMessage && latestMissionResults.length > 0
        ? `${latestMissionMessage.id ?? latestMissionMessageIndex}:${latestMissionResults.map((mission) => mission.missionId).join('|')}:${latestMissionBonus}`
        : null;
    useEffect(() => {
        if (turns.length === 0) return;

        turns.forEach((turn) => {
            if (publishedMissionTurnIds.current.has(turn.evaluation.turnId)) return;
            publishedMissionTurnIds.current.add(turn.evaluation.turnId);

            addMissionCandidates(getPracticeMissionCandidates(
                turn,
                getAssistantPromptAfterTurn(messages, turn.evaluation.turnId),
            ));
        });
    }, [addMissionCandidates, messages, turns]);

    useEffect(() => {
        if (!latestMissionId || shownMissionCelebrationIds.current.has(latestMissionId)) return;

        playMissionClearSound();
        const nextCelebration = {
            id: latestMissionId,
            targets: latestMissionResults.map((mission) => mission.target),
            bonus: latestMissionBonus,
        };

        shownMissionCelebrationIds.current.add(latestMissionId);
        const showTimer = window.setTimeout(() => {
            setMissionCelebrations((current) => [
                nextCelebration,
                ...current.filter((celebration) => celebration.id !== latestMissionId),
            ]);

            const dismissTimer = window.setTimeout(() => {
                missionCelebrationTimers.current.delete(latestMissionId);
                setMissionCelebrations((current) => current.filter((celebration) => celebration.id !== latestMissionId));
            }, MISSION_CELEBRATION_VISIBLE_MS);
            missionCelebrationTimers.current.set(latestMissionId, dismissTimer);
        }, 0);
        missionCelebrationTimers.current.set(latestMissionId, showTimer);
    }, [latestMissionBonus, latestMissionId, latestMissionResults]);

    useEffect(() => () => {
        missionCelebrationTimers.current.forEach((timer) => window.clearTimeout(timer));
        missionCelebrationTimers.current.clear();
    }, []);

    return (
        <aside className="relative flex h-full min-h-0 flex-col border-t border-[#483c2d]/10 bg-[#f4ece4]/75 backdrop-blur-xl print:border-0 print:bg-white lg:border-l lg:border-t-0">
            <MissionSuccessCelebration celebrations={missionCelebrations} />
            <PrintReport turns={turns} sessionScore={sessionScore} />

            <div className="flex items-center justify-between border-b border-[#483c2d]/10 px-5 py-4 print:hidden">
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#6b5a4a]" />
                    <h2 className="font-bold tracking-tight text-[#483c2d]">English Coach</h2>
                </div>
                <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={turns.length === 0}
                    className="rounded-full p-2 text-[#6b5a4a] transition-colors hover:bg-[#483c2d]/10 focus:outline-none focus:ring-2 focus:ring-[#6b5a4a]/30 disabled:cursor-not-allowed disabled:opacity-40"
                    title={turns.length === 0 ? '출력할 평가가 없습니다' : '평가 리포트 출력'}
                    aria-label="평가 리포트 출력"
                >
                    <Printer className="h-4 w-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 print:hidden xl:p-5">
                <StatusLine pendingCount={pendingCount} unavailableMessages={unavailableMessages} />

                {turns.length === 0 ? (
                    <section className="mt-4 rounded-lg border border-dashed border-[#483c2d]/20 bg-white/45 p-4 text-sm leading-relaxed text-[#6b5a4a]">
                        아바타와 영어로 대화하면 답변마다 자동으로 코칭이 쌓입니다. 대화는 끊지 않고, 이 패널에서 점수와 교정 근거만 조용히 업데이트합니다.
                    </section>
                ) : (
                    <div className="mt-4 grid min-h-full gap-4 xl:grid-cols-[minmax(520px,1.2fr)_minmax(300px,0.8fr)]">
                        <div className="order-2 space-y-4 xl:order-2">
                            <section className="overflow-hidden rounded-lg border border-white/50 bg-white/70 shadow-sm">
                                <div className="relative p-4">
                                    <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-white/45" />
                                    <div className="relative flex items-center gap-4">
                                        <TierBadge tier={tier.tier} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-semibold uppercase tracking-normal text-[#6b5a4a]/70">자동 코치 티어</p>
                                            <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1">
                                                <span className="break-words text-4xl font-black leading-none" style={{ color: tier.tier.text }}>
                                                    {tier.tier.label}
                                                </span>
                                                <span className="pb-1 text-sm font-bold text-[#6b5a4a]">{tier.lp} LP</span>
                                            </div>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-[#6b5a4a]">{tier.tier.subtitle}</p>
                                            <p className="mt-1 text-xs font-bold" style={{ color: tier.tier.text }}>
                                                {getScoreTone(sessionScore)}
                                            </p>
                                            <div className="mt-3 h-3 overflow-hidden rounded-full border border-[#5b4939]/20 bg-[#cbb8a3] shadow-inner">
                                                <div
                                                    className="h-full rounded-full shadow-[0_0_10px_rgba(34,197,94,0.55)] transition-all duration-500"
                                                    style={{ width: `${tier.progress}%`, background: 'linear-gradient(90deg, #f97316 0%, #facc15 48%, #22c55e 100%)' }}
                                                />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-3 text-xs font-black text-[#483c2d]">
                                                <span>총 {tier.totalLp} LP</span>
                                                <span>{tier.nextTier ? `${tier.nextTier.label}까지 ${100 - tier.lp} LP` : '최고 티어'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative mt-4 flex items-center justify-between gap-2 rounded-md bg-[#fdf8f4]/80 px-3 py-2">
                                        <div className="text-xs font-semibold text-[#6b5a4a]">
                                            더 높은 배지를 얻으려면 답변에 이유나 예시를 한 문장 더 붙여보세요.
                                        </div>
                                        <p className={`shrink-0 flex items-center gap-1 text-xs font-bold ${tier.latestDelta < 0 ? 'text-[#9a4b36]' : 'text-[#3d6f4a]'}`}>
                                            {tier.latestDelta < 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                                            {tier.latestDelta > 0 ? '+' : ''}{tier.latestDelta} LP
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-[#483c2d]/10 bg-[#f8f1ea]/80 px-4 py-3">
                                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                                        {TIERS.map((item) => (
                                            <MiniTierBadge key={item.id} tier={item} />
                                        ))}
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-lg border border-white/50 bg-white/70 p-4 shadow-sm">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="rounded-md bg-[#fdf8f4]/90 px-3 py-2">
                                        <p className="text-[11px] font-bold text-[#6b5a4a]/70">누적 답변</p>
                                        <p className="mt-1 text-lg font-black leading-none text-[#483c2d]">{turns.length}</p>
                                    </div>
                                    <div className="rounded-md bg-[#eef8f6] px-3 py-2">
                                        <p className="text-[11px] font-bold text-[#265651]/70">최근 점수</p>
                                        <p className="mt-1 text-lg font-black leading-none text-[#1f4f4a]">
                                            {latestTurn ? getMetricScore(latestTurn.evaluation, 'overall') : '--'}
                                        </p>
                                    </div>
                                    <div className="rounded-md bg-[#fff7e8] px-3 py-2">
                                        <p className="text-[11px] font-bold text-[#7a5a23]/70">우선 연습</p>
                                        <p className="mt-1 truncate text-sm font-black text-[#6b4f20]" title={weakestMetric?.label}>
                                            {weakestMetric?.label ?? '--'}
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-3 text-xs leading-relaxed text-[#6b5a4a]">
                                    점수는 답변 품질을 냉정하게 보정하고, LP는 꾸준히 대화를 확장하는 연습량을 반영합니다.
                                </p>
                            </section>

                            <section className="rounded-lg border border-white/50 bg-white/70 p-4 shadow-sm">
                                <h3 className="mb-3 text-sm font-bold text-[#483c2d]">영역별 평균</h3>
                                <div className="space-y-3">
                                    {metricAverages.map((metric) => (
                                        <MetricBar key={metric.key} label={metric.label} value={metric.value} />
                                    ))}
                                </div>
                            </section>
                        </div>

                        <div className="order-1 flex flex-col gap-4 xl:order-1">
                            <ActiveMissionsPanel missions={activeMissions} />

                            {latestTurn && (
                                <section className="max-h-[390px] shrink-0 overflow-y-auto rounded-lg border border-[#3d6f4a]/20 bg-white/80 shadow-sm">
                                    <div className="bg-[#edf5ed] px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-normal text-[#29452c]">
                                                    <Sparkles className="h-3.5 w-3.5" />
                                                    다음에 이렇게 말하세요
                                                </p>
                                                <p className="mt-2 break-words text-xl font-black leading-snug text-[#243f27]">
                                                    {getRetrySentence(latestTurn)}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${getScoreAccent(getMetricScore(latestTurn.evaluation, 'overall'))}`}>
                                                {getMetricScore(latestTurn.evaluation, 'overall')}
                                            </span>
                                        </div>
                                        {getCoachReason(latestTurn.evaluation) && (
                                            <p className="mt-2 break-words text-xs font-semibold leading-relaxed text-[#3f6543]">
                                                {getCoachReason(latestTurn.evaluation)}
                                            </p>
                                        )}
                                    </div>

                                    <div className="p-4">
                                        <div className="min-w-0">
                                            {latestMissionResults.length > 0 && (
                                                <div className="rounded-md bg-[#f8f1ea]/85 p-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-xs font-semibold uppercase tracking-normal text-[#6b5a4a]/70">미션 달성</p>
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-[#e5f7df] px-2 py-0.5 text-xs font-black text-[#25612e]">
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            {latestMissionResults.length}개 성공 +{latestMissionBonus} LP
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 space-y-2">
                                                        {latestMissionResults.map((mission) => (
                                                            <div key={mission.missionId} className="rounded-md bg-white/55 px-2 py-1.5">
                                                                <p className="break-words text-sm font-black leading-snug text-[#483c2d]">
                                                                    {mission.title}: {mission.target}
                                                                </p>
                                                                <p className="mt-0.5 break-words text-xs font-semibold leading-relaxed text-[#6b5a4a]">
                                                                    {mission.reason} +{mission.bonus} LP
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-3 grid gap-3 2xl:grid-cols-2">
                                            <div className="rounded-md bg-[#fdf8f4]/90 p-3 text-xs leading-relaxed text-[#5b4939]">
                                                <p className="font-bold text-[#483c2d]">방금 답변</p>
                                                <p className="mt-1 break-words">{latestTurn.message.content}</p>
                                            </div>
                                            <div className="rounded-md bg-[#eef8f6] p-3 text-xs leading-relaxed text-[#265651]">
                                                <p className="flex items-center gap-1 font-bold text-[#1f4f4a]"><Target className="h-3.5 w-3.5" /> 집중 포인트</p>
                                                <p className="mt-1 break-words">{getLatestFocus(latestTurn.evaluation)}</p>
                                            </div>
                                            {latestTurn.evaluation.feedback.strength && (
                                                <div className="rounded-md bg-[#f8f1ea]/90 p-3 text-xs leading-relaxed text-[#5b4939]">
                                                    <p className="font-bold text-[#483c2d]">잘한 점</p>
                                                    <p className="mt-1 break-words">{latestTurn.evaluation.feedback.strength}</p>
                                                </div>
                                            )}
                                            <div className="rounded-md bg-[#fff7e8] p-3 text-xs leading-relaxed text-[#6b4f20]">
                                                <p className="font-bold text-[#5a421a]">한 번 더 말하기</p>
                                                <p className="mt-1 break-words">위 문장을 입으로 다시 말한 뒤, 같은 뜻으로 한 문장만 더 붙여보세요.</p>
                                            </div>
                                        </div>

                                        <details className="mt-3 rounded-md bg-[#f8f1ea]/70 px-3 py-2 text-xs leading-relaxed text-[#6b5a4a]">
                                            <summary className="cursor-pointer font-bold text-[#483c2d]">점수 근거 보기</summary>
                                            <p className="mt-1 break-words">
                                                {latestTurn.evaluation.evidence.overall || latestTurn.evaluation.cefrEstimate.reason}
                                            </p>
                                        </details>

                                        {latestTurn.evaluation.calibrationNotes && latestTurn.evaluation.calibrationNotes.length > 0 && (
                                            <p className="mt-3 rounded-md bg-[#f7ece8] px-3 py-2 text-xs leading-relaxed text-[#7a4b3a]">
                                                {latestTurn.evaluation.calibrationNotes.join(' ')}
                                            </p>
                                        )}
                                        <p className="mt-3 text-xs leading-relaxed text-[#6b5a4a]">
                                            레벨 힌트 {latestTurn.evaluation.cefrEstimate.level}: {latestTurn.evaluation.cefrEstimate.reason}
                                        </p>
                                    </div>
                                </section>
                            )}

                            <section className="flex min-h-[220px] flex-1 flex-col rounded-lg border border-white/50 bg-white/70 p-4 shadow-sm">
                                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                                    <h3 className="text-sm font-bold text-[#483c2d]">이전 답변 피드백</h3>
                                    <span className="shrink-0 text-xs font-semibold text-[#6b5a4a]/70">전체 {previousTurns.length}개</span>
                                </div>
                                {previousTurns.length === 0 ? (
                                    <p className="text-xs leading-relaxed text-[#6b5a4a]">답변이 더 쌓이면 이곳에서 이전 피드백을 스크롤로 다시 볼 수 있습니다.</p>
                                ) : (
                                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                                        <div className="grid gap-2 2xl:grid-cols-2">
                                            {previousTurns.map((turn, index) => (
                                                <FeedbackCard key={`${turn.evaluation.turnId}-${index}`} turn={turn} compact={index > 5} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
