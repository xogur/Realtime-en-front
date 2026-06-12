'use client';

import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Clock,
    Minus,
    Plus,
    Printer,
    RotateCcw,
    Sparkles,
    Target,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore, type ChatMessage, type EvaluationBatchStatus, type PracticeMission, type TurnCorrection, type TurnEvaluation } from '@/stores/useStore';
import {
    clampScore,
    getCurrentMessageLp,
    getMetricScore,
    getMissionResultsFromCompletions,
    getTurnLp,
} from '@/lib/missionLp';
import { calculateTierProgress } from '@/lib/tierProgress';

type EvaluatedTurn = {
    message: ChatMessage;
    evaluation: TurnEvaluation;
};

const subscribeClientReady = () => () => undefined;
const getClientReadySnapshot = () => true;
const getServerReadySnapshot = () => false;

type ReportCorrection = EvaluatedTurn & {
    assistantPrompt: string;
};

type MetricKey = 'grammar' | 'vocabulary' | 'relevance' | 'fluency' | 'interaction';
type TierId = 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';

type MetricSnapshot = { key: MetricKey; label: string; value: number };

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
    { key: 'relevance', label: '응답 적합도' },
    { key: 'fluency', label: '유창성' },
    { key: 'interaction', label: '상호작용' },
];

const TIERS: TierConfig[] = [
    {
        id: 'unranked',
        label: 'Unranked',
        subtitle: '말하기 연습을 시작하는 단계',
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
        label: 'Bronze',
        subtitle: '기본 응답 습관을 만드는 단계',
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
        label: 'Silver',
        subtitle: '짧은 문장을 안정적으로 말하는 단계',
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
        label: 'Gold',
        subtitle: '이유와 예시로 답변을 확장하는 단계',
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
        label: 'Platinum',
        subtitle: '균형 있고 자연스럽게 응답하는 단계',
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
        label: 'Diamond',
        subtitle: '정확하고 표현력 있게 말하는 단계',
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
        label: 'Master',
        subtitle: '깊이 있고 자신감 있게 대화를 이끄는 단계',
        from: '#fff4bd',
        via: '#7054d8',
        to: '#171d4f',
        stroke: '#d6b84c',
        text: '#2a225f',
        glow: 'shadow-[#7d64e8]/55',
        symbol: 'crown',
    },
];
function average(values: number[]): number {
    if (values.length === 0) return 0;
    return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function shouldShowCoachContent(evaluatedTurnCount: number, hasRealtimeCorrection: boolean): boolean {
    return evaluatedTurnCount > 0 || hasRealtimeCorrection;
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
            target: '첫 응답을 평가하면 다음 미션이 정해집니다.',
            reason: '다음 응답부터 미션 보상 LP를 받을 수 있습니다.',
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
            : `${mission.metricLabel} 미션은 아직 미달성입니다. 다음 응답에서 목표를 다시 시도해보세요.`,
    };
}

*/

function getTierProgress(
    turns: EvaluatedTurn[],
    pendingMissionBonus = 0,
    latestPendingMissionBonus = 0,
    developerLpDeltas: number[] = [],
) {
    return calculateTierProgress({
        tiers: TIERS,
        turnLps: [...turns.map((turn) => getTurnLp(turn)), ...developerLpDeltas],
        pendingMissionBonus,
        latestPendingMissionBonus: developerLpDeltas.length > 0 ? 0 : latestPendingMissionBonus,
    });
}

function getTierTone(tierId: TierId, score: number | null): string {
    if (tierId === 'master') return '최고 티어 달성';
    if (tierId === 'diamond') return '고급 표현 유지 중';
    if (tierId === 'platinum') return '균형 잡힌 응답';
    if (tierId === 'gold') return '답변 확장 중';
    if (tierId === 'silver') return '문장 안정화 중';
    if (tierId === 'bronze') return '기초 습관 형성 중';
    if (score === null) return '첫 응답을 기다리는 중';
    return '기초 다지기 단계';
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
    return turn.message.correction?.suggested || turn.evaluation.correction.suggested || turn.message.content;
}

function getCoachReason(evaluation: TurnEvaluation, correction?: TurnCorrection): string {
    return correction?.reason || evaluation.correction.reason || evaluation.evidence.overall || evaluation.cefrEstimate.reason;
}

function getContextFitLabel(contextFit?: TurnCorrection['contextFit']): string {
    if (contextFit === 'appropriate') return '문맥 적합';
    if (contextFit === 'partial') return '부분 적합';
    if (contextFit === 'off_topic') return '문맥 불일치';
    return '문맥 확인';
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
        if (weakestMetric?.key === 'fluency') return '방금 질문에 답하면서 멈추지 말고 두 문장으로 이어서 말해보세요.';
        if (weakestMetric?.key === 'interaction') return '방금 질문에 답한 뒤 상대에게 되묻는 질문을 하나 붙여보세요.';
        return '방금 질문에 답하고 because로 이유를 한 문장 붙여보세요.';
    }
    if (evaluation.feedback.nextPractice) return evaluation.feedback.nextPractice;
    if (weakestMetric?.key === 'vocabulary') return '같은 뜻을 더 구체적인 단어 하나로 바꾸어 다시 말해보세요.';
    if (weakestMetric?.key === 'grammar') return '주어와 동사를 분명히 넣고 같은 뜻을 다시 말해보세요.';
    if (weakestMetric?.key === 'fluency') return '짧게 끊지 말고 두 문장으로 이어서 다시 말해보세요.';
    if (weakestMetric?.key === 'interaction') return '마지막에 상대에게 묻는 질문을 하나 붙여보세요.';
    return '응답 끝에 because, for example, so 중 하나를 붙여 두 문장으로 확장해보세요.';
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

function compactReportText(text: string, maxLength = 180): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function getAssistantPromptBeforeTurn(messages: ChatMessage[], turnId: string): string {
    const sourceIndex = messages.findIndex((message) => message.role === 'user' && message.id === turnId);
    if (sourceIndex < 0) return '';

    for (let index = sourceIndex - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message.role === 'assistant') {
            return compactReportText(cleanAssistantPrompt(message.content));
        }
    }

    return '';
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
            title: '이유 연결하기',
            target: '다음 답변에 because, so, but, for example 중 하나를 사용해 보세요.',
            successHint: '연결 표현을 사용해 답변을 더 자연스럽게 확장했습니다.',
            rewardLp: 6,
            checks: [{ type: 'connector' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:opinion`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '의견 말하기',
            target: '다음 답변에 I think 또는 in my opinion을 사용해 보세요.',
            successHint: '자신의 의견을 분명하게 표현했습니다.',
            rewardLp: 5,
            checks: [{ type: 'includesAny', value: ['I think', 'in my opinion'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:length-8`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'length',
            title: '길게 말하기',
            target: '다음 답변을 영어 단어 8개 이상으로 말해 보세요.',
            successHint: '유창성을 연습할 만큼 충분히 길게 답했습니다.',
            rewardLp: 5,
            checks: [{ type: 'minWords', min: 8 }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:preference`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '선호 표현하기',
            target: '다음 답변에 I prefer 또는 I would rather를 사용해 보세요.',
            successHint: '자신의 선호를 분명하게 표현했습니다.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['I prefer', 'I would rather'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:question`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'question',
            title: '질문 이어가기',
            target: '대화를 이어갈 수 있도록 질문을 하나 추가해 보세요.',
            successHint: '후속 질문으로 대화를 자연스럽게 이어갔습니다.',
            rewardLp: 7,
            checks: [{ type: 'question' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:frequency`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '빈도 말하기',
            target: '다음 답변에 usually, often, sometimes 중 하나를 사용해 보세요.',
            successHint: '어떤 일이 얼마나 자주 일어나는지 표현했습니다.',
            rewardLp: 5,
            checks: [{ type: 'includesAny', value: ['usually', 'often', 'sometimes'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:past`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'tense',
            title: '과거 시제',
            target: 'went, did, was 또는 -ed 동사처럼 과거 표현을 하나 사용해 보세요.',
            successHint: '답변에 과거 시제를 사용했습니다.',
            rewardLp: 6,
            checks: [{ type: 'pastTense' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:sequence`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '순서대로 말하기',
            target: '다음 답변에 first, then, finally 중 하나를 사용해 보세요.',
            successHint: '순서 표현을 사용해 내용을 이해하기 쉽게 말했습니다.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['first', 'then', 'finally'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:future`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'tense',
            title: '미래 계획 말하기',
            target: 'will, going to, plan to 같은 미래 표현을 하나 사용해 보세요.',
            successHint: '미래 표현을 자연스럽게 사용했습니다.',
            rewardLp: 6,
            checks: [{ type: 'futureTense' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:addition`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '내용 덧붙이기',
            target: '다음 답변에 also 또는 in addition을 사용해 보세요.',
            successHint: '추가 표현을 사용해 유용한 내용을 덧붙였습니다.',
            rewardLp: 5,
            checks: [{ type: 'includesAny', value: ['also', 'in addition'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:polite`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'interaction',
            title: '정중하게 요청하기',
            target: 'can you, could you, would you, please 중 하나로 정중하게 요청해 보세요.',
            successHint: '정중한 요청 표현을 사용했습니다.',
            rewardLp: 7,
            checks: [{ type: 'politeRequest' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:uncertainty`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '확실하지 않게 말하기',
            target: '다음 답변에 maybe, perhaps, probably 중 하나를 사용해 보세요.',
            successHint: '확실하지 않은 생각을 자연스럽게 표현했습니다.',
            rewardLp: 5,
            checks: [{ type: 'includesAny', value: ['maybe', 'perhaps', 'probably'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:two-sentences`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'length',
            title: '두 문장 말하기',
            target: '다음 답변을 영어 두 문장 이상으로 말해 보세요.',
            successHint: '답변을 두 문장 이상으로 확장했습니다.',
            rewardLp: 6,
            checks: [{ type: 'sentenceCount', min: 2 }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:agreement`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'interaction',
            title: '동의 표현하기',
            target: '다음 답변에 I agree 또는 that is true를 사용해 보세요.',
            successHint: '동의하는 생각을 분명하게 표현했습니다.',
            rewardLp: 5,
            checks: [{ type: 'includesAny', value: ['I agree', 'that is true'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:present-perfect`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'tense',
            title: '경험 말하기',
            target: 'have tried 또는 have learned 같은 현재완료 표현을 사용해 보세요.',
            successHint: '현재완료를 사용해 경험을 표현했습니다.',
            rewardLp: 7,
            checks: [{ type: 'presentPerfect' }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:disagreement`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'interaction',
            title: '다른 의견 말하기',
            target: '다음 답변에 I do not agree 또는 I see it differently를 사용해 보세요.',
            successHint: '다른 관점을 분명하게 표현했습니다.',
            rewardLp: 7,
            checks: [{ type: 'includesAny', value: ['I do not agree', 'I see it differently'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:length-10`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'length',
            title: '열 단어 말하기',
            target: '다음 답변을 영어 단어 10개 이상으로 말해 보세요.',
            successHint: '영어 단어 10개 이상으로 답했습니다.',
            rewardLp: 6,
            checks: [{ type: 'minWords', min: 10 }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:comparison`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '비교하기',
            target: '다음 답변에 more than 또는 less than을 사용해 보세요.',
            successHint: '두 대상을 직접 비교했습니다.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['more than', 'less than'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:example-detail`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '예시 들기',
            target: '다음 답변에 such as를 사용해 예시를 들어 보세요.',
            successHint: '구체적인 예시를 답변에 추가했습니다.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['such as'] }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:contrast-view`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '반대 관점 덧붙이기',
            target: '다음 답변에 however 또는 on the other hand를 사용해 보세요.',
            successHint: '서로 다른 관점을 함께 표현했습니다.',
            rewardLp: 7,
            checks: [{ type: 'includesAny', value: ['however', 'on the other hand'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:three-sentences`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'length',
            title: '세 문장 말하기',
            target: '다음 답변을 영어 세 문장 이상으로 말해 보세요.',
            successHint: '세 문장 이상으로 생각을 충분히 전개했습니다.',
            rewardLp: 8,
            checks: [{ type: 'sentenceCount', min: 3 }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:depends`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'interaction',
            title: '상황에 따라 답하기',
            target: '다음 답변에 it depends를 사용해 보세요.',
            successHint: '상황에 따라 답이 달라질 수 있음을 표현했습니다.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['it depends'] }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:condition`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'grammar',
            title: '조건 붙이기',
            target: '다음 답변에 if를 사용해 조건을 말해 보세요.',
            successHint: '답변에 분명한 조건을 추가했습니다.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['if'] }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:habit`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'grammar',
            title: '과거 습관 말하기',
            target: '다음 답변에 used to를 사용해 보세요.',
            successHint: '과거의 습관을 표현했습니다.',
            rewardLp: 7,
            checks: [{ type: 'includesAny', value: ['used to'] }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:clarify`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'interaction',
            title: '뜻을 풀어서 말하기',
            target: '다음 답변에 I mean 또는 in other words를 사용해 보세요.',
            successHint: '자신이 말한 뜻을 더 명확하게 설명했습니다.',
            rewardLp: 7,
            checks: [{ type: 'includesAny', value: ['I mean', 'in other words'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:length-12`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'length',
            title: '열두 단어 말하기',
            target: '다음 답변을 영어 단어 12개 이상으로 말해 보세요.',
            successHint: '영어 단어 12개 이상으로 답했습니다.',
            rewardLp: 7,
            checks: [{ type: 'minWords', min: 12 }],
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:reaction`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'interaction',
            title: '자연스럽게 반응하기',
            target: '다음 답변에 sounds good 또는 that makes sense를 사용해 보세요.',
            successHint: '상대의 말에 자연스럽게 반응했습니다.',
            rewardLp: 5,
            checks: [{ type: 'includesAny', value: ['sounds good', 'that makes sense'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:emphasis`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '중요한 점 강조하기',
            target: '다음 답변에 actually 또는 in fact를 사용해 보세요.',
            successHint: '중요한 내용을 강조해서 말했습니다.',
            rewardLp: 6,
            checks: [{ type: 'includesAny', value: ['actually', 'in fact'] }],
            matchMode: 'any',
            createdAt,
        },
        {
            id: `${turn.evaluation.turnId}:length-14`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'length',
            title: '열네 단어 말하기',
            target: '다음 답변을 영어 단어 14개 이상으로 말해 보세요.',
            successHint: '영어 단어 14개 이상으로 답했습니다.',
            rewardLp: 8,
            checks: [{ type: 'minWords', min: 14 }],
            createdAt,
        },
    ];

    if (weakest.key === 'vocabulary') {
        pool.unshift({
            id: `${turn.evaluation.turnId}:example`,
            sourceTurnId: turn.evaluation.turnId,
            kind: 'vocabulary',
            title: '구체적인 예시 들기',
            target: 'for example 또는 like를 사용해 구체적인 예시를 하나 추가해 보세요.',
            successHint: '답변에 구체적인 예시를 추가했습니다.',
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
        <section className="max-h-[300px] shrink-0 overflow-hidden rounded-lg border border-[#483c2d]/10 bg-white/80 p-3 shadow-sm">
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
            <div className="mt-3 grid max-h-[230px] gap-2 overflow-y-auto pr-1">
                {missions.map((mission) => (
                    <div key={mission.id} className="rounded-md border border-[#483c2d]/10 bg-[#fffaf5]/90 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#edf5ed] px-2 py-0.5 text-[11px] font-black text-[#29452c]">
                                {mission.title}
                            </span>
                            <span className="text-[11px] font-black text-[#3d6f4a]">+{mission.rewardLp} LP</span>
                        </div>
                        <p className="mt-1 break-words text-sm font-black leading-snug text-[#483c2d]">
                            {mission.target}
                        </p>
                        {mission.usageContext && (
                            <p className="mt-1 break-words text-[11px] font-semibold leading-snug text-[#6b5a4a]">
                                상황: {mission.usageContext}
                            </p>
                        )}
                        {mission.exampleSentence && (
                            <p className="mt-1 break-words rounded bg-white/70 px-2 py-1 text-[12px] font-bold leading-snug text-[#29452c]">
                                예문: {mission.exampleSentence}
                            </p>
                        )}
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
    const instanceId = useId().replace(/:/g, '');
    const gradientId = `tier-gradient-${tier.id}-${instanceId}`;
    const shineId = `tier-shine-${tier.id}-${instanceId}`;
    const glowId = `tier-glow-${tier.id}-${instanceId}`;
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
                    <filter id={glowId} x="-35%" y="-35%" width="170%" height="170%">
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

                {elite && <circle cx="64" cy="64" r="55" fill={`url(#${gradientId})`} opacity="0.22" filter={`url(#${glowId})`} />}
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

function formatCountdown(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds}초`;
    return `${minutes}분 ${seconds.toString().padStart(2, '0')}초`;
}

function getBatchCountdown(status: EvaluationBatchStatus | null, nowEpochMs: number): string | null {
    if (!status || status.pendingCount <= 0) return null;
    if (status.nextFlushAtEpochMs) {
        return formatCountdown(status.nextFlushAtEpochMs - nowEpochMs);
    }
    return formatCountdown(status.delaySeconds * 1000);
}

function StatusLine({
    pendingCount,
    skippedCount,
    unavailableMessages,
    evaluationBatchStatus,
    nowEpochMs,
}: {
    pendingCount: number;
    skippedCount: number;
    unavailableMessages: ChatMessage[];
    evaluationBatchStatus: EvaluationBatchStatus | null;
    nowEpochMs: number;
}) {
    if (pendingCount > 0) {
        const queuedCount = evaluationBatchStatus?.pendingCount ?? pendingCount;
        const turnsUntilEvaluation = evaluationBatchStatus
            ? Math.max(0, evaluationBatchStatus.maxTurns - evaluationBatchStatus.pendingCount)
            : null;
        const countdown = getBatchCountdown(evaluationBatchStatus, nowEpochMs);
        const isEvaluatingNow = Boolean(evaluationBatchStatus && evaluationBatchStatus.pendingCount <= 0);

        return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-[#fff7e8] px-3 py-2 text-xs font-medium text-[#6b5a4a]">
                <Clock className="h-4 w-4" />
                <span>{pendingCount}개 응답을 평가 대기 중입니다.</span>
                <span className="font-bold text-[#8a5a22]">
                    {isEvaluatingNow
                        ? '평가 요청됨. 결과 수신 중'
                        : `${countdown ?? '30초'} 이내 또는 ${turnsUntilEvaluation ?? 4}개 발화 후 평가`}
                </span>
                {queuedCount !== pendingCount ? (
                    <span className="text-[#8a5a22]/75">큐 {queuedCount}개</span>
                ) : null}
            </div>
        );
    }

    if (unavailableMessages.length > 0) {
        const codes = Array.from(new Set(unavailableMessages.map((message) => message.evaluationErrorCode).filter(Boolean)));
        return (
            <div className="flex items-center gap-2 rounded-md bg-[#f7ece8] px-3 py-2 text-xs font-medium text-[#7a4b3a]">
                <AlertCircle className="h-4 w-4" />
                <span>
                    {unavailableMessages.length}개 응답은 평가하지 못했습니다.
                    {codes.length > 0 ? ` 원인: ${codes.join(', ')}` : ''}
                </span>
            </div>
        );
    }

    if (skippedCount > 0) {
        return (
            <div className="flex items-center gap-2 rounded-md bg-[#f1f1ed] px-3 py-2 text-xs font-medium text-[#5d5d55]">
                <CheckCircle2 className="h-4 w-4" />
                <span>{skippedCount}개 응답은 평가 대상에서 제외했습니다.</span>
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
    const correction = turn.message.correction?.suggested || evaluation.correction.suggested;
    const reason = evaluation.evidence.overall || turn.message.correction?.reason || evaluation.correction.reason;

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

function getReportCorrections(turns: EvaluatedTurn[], messages: ChatMessage[]): ReportCorrection[] {
    const correctionTurns = turns.filter((turn) => {
        const original = turn.evaluation.correction.original.trim() || turn.message.content.trim();
        const suggested = turn.evaluation.correction.suggested.trim();
        return suggested.length > 0 && suggested.toLowerCase() !== original.toLowerCase();
    });

    return (correctionTurns.length > 0 ? correctionTurns : turns)
        .slice(-6)
        .reverse()
        .map((turn) => ({
            ...turn,
            assistantPrompt: getAssistantPromptBeforeTurn(messages, turn.message.id ?? turn.evaluation.turnId),
        }));
}

function getReportHighlights(turns: EvaluatedTurn[], metricAverages: MetricSnapshot[]) {
    const latestTurn = turns[turns.length - 1] ?? null;
    const strongest = metricAverages.reduce((best, metric) => (metric.value > best.value ? metric : best), metricAverages[0]);
    const weakest = getWeakestMetric(metricAverages);

    return {
        strongest,
        weakest,
        strength: latestTurn?.evaluation.feedback.strength || latestTurn?.evaluation.evidence[strongest?.key] || '꾸준히 말하기를 시도한 점이 좋습니다.',
        improvement: latestTurn?.evaluation.feedback.improvement || latestTurn?.evaluation.evidence[weakest?.key] || '각 답변에 이유나 예시를 한 문장 더 붙여보세요.',
        nextPractice: latestTurn?.evaluation.feedback.nextPractice || 'because, so, for example 중 하나를 사용해 2-3문장으로 답해보세요.',
    };
}

function PrintScoreRing({ score }: { score: number | null }) {
    const value = score ?? 0;
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const dash = (clampScore(value) / 100) * circumference;

    return (
        <div className="relative flex h-[118px] w-[118px] shrink-0 items-center justify-center">
            <svg viewBox="0 0 112 112" className="h-full w-full" aria-label={`종합 점수 ${score ?? 0}점`}>
                <circle cx="56" cy="56" r={radius} fill="none" stroke="#efe5d8" strokeWidth="10" />
                <circle
                    cx="56"
                    cy="56"
                    r={radius}
                    fill="none"
                    stroke="#2f6f4f"
                    strokeLinecap="round"
                    strokeWidth="10"
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    transform="rotate(-90 56 56)"
                />
            </svg>
            <div className="absolute text-center">
                <p className="text-[30px] font-black leading-none text-[#2f261e]">{score ?? '--'}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">점수</p>
            </div>
        </div>
    );
}

function PrintMetricBar({ label, value }: { label: string; value: number }) {
    return (
        <div className="grid grid-cols-[76px_1fr_34px] items-center gap-2 text-[11px]">
            <span className="font-bold text-[#514337]">{label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#efe5d8]">
                <div className="h-full rounded-full bg-[#2f6f4f]" style={{ width: `${clampScore(value)}%` }} />
            </div>
            <span className="text-right font-black text-[#2f261e]">{value}</span>
        </div>
    );
}

function PrintInsightCard({ title, value, tone = 'neutral' }: { title: string; value: string; tone?: 'neutral' | 'good' | 'focus' }) {
    const toneClass = tone === 'good'
        ? 'border-[#2f6f4f]/25 bg-[#edf5ed] text-[#29452c]'
        : tone === 'focus'
            ? 'border-[#b77f1e]/25 bg-[#fff7e8] text-[#6b4f20]'
            : 'border-[#6b5a4a]/15 bg-[#f8f1ea] text-[#514337]';

    return (
        <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
            <p className="text-[10px] font-black uppercase tracking-normal opacity-70">{title}</p>
            <p className="mt-1 text-[12px] font-bold leading-snug">{value}</p>
        </div>
    );
}

function PrintReport({
    messages,
    turns,
    sessionScore,
    metricAverages,
}: {
    messages: ChatMessage[];
    turns: EvaluatedTurn[];
    sessionScore: number | null;
    metricAverages: MetricSnapshot[];
}) {
    const correctionTurns = getReportCorrections(turns, messages);
    const reportTier = getTierProgress(turns);
    const latestTurn = turns[turns.length - 1] ?? null;
    const highlights = getReportHighlights(turns, metricAverages);
    const reportDate = new Intl.DateTimeFormat('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date());

    return (
        <section className="print-document hidden bg-white text-[#2f261e]">
            <div className="mx-auto max-w-[184mm]">
                <article className="print-page break-after-page">
                    <header className="flex items-start justify-between border-b-4 border-[#6b5a4a] pb-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-normal text-[#8a6f5a]">영어 말하기 평가</p>
                            <h1 className="mt-1 text-[28px] font-black tracking-normal text-[#2f261e]">영어 코치 리포트</h1>
                            <p className="mt-1 text-[11px] font-semibold text-[#6b5a4a]">
                                {reportDate} · UXROOM Voice Chat · 평가 응답 {turns.length}개
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">현재 티어</p>
                            <p className="mt-1 text-[22px] font-black leading-none" style={{ color: reportTier.tier.text }}>{reportTier.tier.label}</p>
                            <p className="mt-1 text-[10px] font-bold text-[#6b5a4a]">{reportTier.totalLp} LP</p>
                        </div>
                    </header>

                    <section className="mt-5 grid grid-cols-[150px_1fr_132px] gap-5">
                        <div className="flex flex-col items-center rounded-md bg-[#f8f1ea] p-4">
                            <PrintScoreRing score={sessionScore} />
                            <p className="mt-2 text-center text-[11px] font-bold leading-snug text-[#6b5a4a]">
                                {latestTurn?.evaluation.cefrEstimate.level ?? 'CEFR'} 추정
                            </p>
                        </div>
                        <div className="rounded-md border border-[#6b5a4a]/15 p-4">
                            <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">영역별 요약</p>
                            <div className="mt-3 space-y-2.5">
                                {metricAverages.map((metric) => (
                                    <PrintMetricBar key={metric.key} label={metric.label} value={metric.value} />
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col items-center justify-center rounded-md border border-[#6b5a4a]/15 p-3">
                            <TierBadge tier={reportTier.tier} size={90} />
                            <p className="mt-2 text-center text-[11px] font-black leading-tight" style={{ color: reportTier.tier.text }}>
                                {reportTier.tier.subtitle}
                            </p>
                            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#efe5d8]">
                                <div className="h-full rounded-full bg-[#2f6f4f]" style={{ width: `${reportTier.progress}%` }} />
                            </div>
                        </div>
                    </section>

                    <section className="mt-4 grid grid-cols-3 gap-3">
                        <PrintInsightCard title="강점" value={highlights.strength} tone="good" />
                        <PrintInsightCard title="집중 영역" value={`${highlights.weakest?.label ?? '연습'}: ${highlights.improvement}`} tone="focus" />
                        <PrintInsightCard title="다음 연습" value={highlights.nextPractice} />
                    </section>

                    <section className="mt-5 rounded-md border border-[#6b5a4a]/15 p-4">
                        <div className="flex items-end justify-between border-b border-[#6b5a4a]/15 pb-2">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">코치 요약</p>
                                <h2 className="text-[18px] font-black text-[#2f261e]">다음에 집중할 연습</h2>
                            </div>
                            <p className="text-[10px] font-bold text-[#6b5a4a]">전문가 상담용 요약</p>
                        </div>
                        <div className="mt-3 grid grid-cols-[1fr_1fr] gap-4 text-[12px] leading-snug">
                            <div>
                                <p className="font-black text-[#2f6f4f]">추천 코칭 방향</p>
                                <p className="mt-1 text-[#514337]">{highlights.improvement}</p>
                            </div>
                            <div>
                                <p className="font-black text-[#2f6f4f]">평가 근거</p>
                                <p className="mt-1 text-[#514337]">
                                    최근 응답에 더 높은 비중을 두고 점수를 계산합니다. 아래 교정 항목은 학습 가치가 분명한 응답만 추렸습니다.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="mt-5">
                        <div className="mb-3 flex items-end justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">핵심 교정</p>
                                <h2 className="text-[18px] font-black text-[#2f261e]">다시 연습할 문장</h2>
                            </div>
                            <p className="text-[10px] font-bold text-[#6b5a4a]">최대 {Math.min(correctionTurns.length, 4)}개</p>
                        </div>
                        <div className="grid gap-2.5">
                            {correctionTurns.slice(0, 4).map((turn, index) => (
                                <article key={`${turn.evaluation.turnId}:page1`} className="rounded-md border-l-4 border-[#2f6f4f] bg-[#f8f1ea] px-3 py-2">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2f6f4f] text-[11px] font-black text-white">{index + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            {turn.assistantPrompt && (
                                                <p className="break-words rounded bg-white/70 px-2 py-1 text-[10px] font-semibold leading-snug text-[#6b5a4a]">
                                                    <span className="font-black text-[#2f6f4f]">AI 질문: </span>{turn.assistantPrompt}
                                                </p>
                                            )}
                                            <p className="mt-1 break-words text-[11px] font-bold leading-snug text-[#6b5a4a]">
                                                <span className="font-black text-[#7a4b3a]">내 답변: </span>{turn.evaluation.correction.original || turn.message.content}
                                            </p>
                                            <p className="mt-1 break-words rounded bg-white px-2 py-1 text-[12px] font-black leading-snug text-[#29452c]">
                                                <span>교정: </span>{turn.evaluation.correction.suggested || turn.message.content}
                                            </p>
                                            <p className="mt-1 break-words text-[10px] font-semibold leading-snug text-[#514337]">
                                                <span className="font-black">근거: </span>{turn.evaluation.correction.reason || turn.evaluation.evidence.overall}
                                            </p>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-[#2f261e]">
                                            {getMetricScore(turn.evaluation, 'overall')}
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                </article>

                <article className="print-page">
                    <header className="border-b-4 border-[#6b5a4a] pb-3">
                        <p className="text-[10px] font-bold uppercase tracking-normal text-[#8a6f5a]">상담 참고자료</p>
                        <h2 className="mt-1 text-[24px] font-black text-[#2f261e]">상세 연습 노트</h2>
                    </header>

                    <section className="mt-5 grid grid-cols-[1fr_1fr] gap-4">
                        <div className="rounded-md border border-[#6b5a4a]/15 p-4">
                            <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">레벨 근거</p>
                            <p className="mt-2 text-[18px] font-black text-[#2f261e]">{latestTurn?.evaluation.cefrEstimate.level ?? '--'}</p>
                            <p className="mt-2 text-[12px] font-semibold leading-snug text-[#514337]">
                                {latestTurn?.evaluation.cefrEstimate.reason ?? '아직 레벨 근거가 충분하지 않습니다.'}
                            </p>
                        </div>
                        <div className="rounded-md border border-[#6b5a4a]/15 p-4">
                            <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">신뢰도</p>
                            <p className="mt-2 text-[18px] font-black capitalize text-[#2f261e]">{latestTurn?.evaluation.confidence ?? '--'}</p>
                            <p className="mt-2 text-[12px] font-semibold leading-snug text-[#514337]">
                                {(latestTurn?.evaluation.confidenceReasons ?? []).slice(0, 2).join(' ') || '최종 레벨 판단은 전문가와 함께 확인하는 것이 좋습니다.'}
                            </p>
                        </div>
                    </section>

                    <section className="mt-5">
                        <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">추가 교정</p>
                        <div className="mt-3 grid gap-2.5">
                            {correctionTurns.slice(4, 6).map((turn, index) => (
                                <article key={`${turn.evaluation.turnId}:page2`} className="rounded-md border-l-4 border-[#b77f1e] bg-[#fff7e8] px-3 py-2">
                                    <div className="flex items-start gap-3">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#b77f1e] text-[11px] font-black text-white">{index + 5}</span>
                                        <div className="min-w-0 flex-1">
                                            {turn.assistantPrompt && (
                                                <p className="break-words rounded bg-white/70 px-2 py-1 text-[10px] font-semibold leading-snug text-[#6b5a4a]">
                                                    <span className="font-black text-[#b77f1e]">AI 질문: </span>{turn.assistantPrompt}
                                                </p>
                                            )}
                                            <p className="mt-1 break-words text-[11px] font-bold leading-snug text-[#6b5a4a]">
                                                <span className="font-black text-[#7a4b3a]">내 답변: </span>{turn.evaluation.correction.original || turn.message.content}
                                            </p>
                                            <p className="mt-1 break-words rounded bg-white px-2 py-1 text-[12px] font-black leading-snug text-[#6b4f20]">
                                                <span>교정: </span>{turn.evaluation.correction.suggested || turn.message.content}
                                            </p>
                                            <p className="mt-1 break-words text-[10px] font-semibold leading-snug text-[#514337]">
                                                <span className="font-black">근거: </span>{turn.evaluation.correction.reason || turn.evaluation.evidence.overall}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            ))}
                            {correctionTurns.length <= 4 && (
                                <p className="rounded-md bg-[#f8f1ea] px-3 py-2 text-[12px] font-semibold text-[#514337]">
                                    추가 교정 항목이 없습니다. 첫 페이지의 핵심 교정을 상담 자료로 사용하세요.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="mt-5 rounded-md border border-[#6b5a4a]/15 p-4">
                        <p className="text-[10px] font-black uppercase tracking-normal text-[#8a6f5a]">7일 연습 계획</p>
                        <div className="mt-3 grid grid-cols-3 gap-3 text-[12px] leading-snug">
                            <PrintInsightCard title="1-2일차" value="교정 문장을 자연스럽게 말할 수 있을 때까지 소리 내어 반복하세요." />
                            <PrintInsightCard title="3-5일차" value={highlights.nextPractice} tone="focus" />
                            <PrintInsightCard title="6-7일차" value="짧은 대화를 한 뒤 같은 실수가 반복되는지 확인하세요." tone="good" />
                        </div>
                    </section>

                    <footer className="mt-6 border-t border-[#6b5a4a]/15 pt-3 text-[10px] font-semibold leading-snug text-[#6b5a4a]">
                        이 리포트는 전체 대화 대신 핵심 교정 근거만 담습니다. 사용자가 출력하거나 전문가와 상담할 때 3페이지를 넘기지 않도록 구성했습니다.
                    </footer>
                </article>
            </div>
        </section>
    );
}
export function AssessmentPanel() {
    const isClientReady = useSyncExternalStore(
        subscribeClientReady,
        getClientReadySnapshot,
        getServerReadySnapshot,
    );
    const printRoot = isClientReady ? document.body : null;
    const messages = useStore((state) => state.messages);
    const evaluationBatchStatus = useStore((state) => state.evaluationBatchStatus);
    const activeMissions = useStore((state) => state.activeMissions);
    const addMissionCandidates = useStore((state) => state.addMissionCandidates);
    const showDeveloperLpControls = process.env.NODE_ENV !== 'production';
    const [developerLpDeltas, setDeveloperLpDeltas] = useState<number[]>([]);
    const [nowEpochMs, setNowEpochMs] = useState(() => Date.now());

    const [missionCelebrations, setMissionCelebrations] = useState<MissionCelebration[]>([]);
    const shownMissionCelebrationIds = useRef<Set<string>>(new Set());
    const missionCelebrationTimers = useRef<Map<string, number>>(new Map());
    const publishedMissionTurnIds = useRef<Set<string>>(new Set());

    const assessment = useMemo(() => {
        const userMessages = messages.filter((message) => message.role === 'user');
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
            latestAssistantPrompt: getLatestAssistantPrompt(messages),
            sessionScore,
            trend,
            metricAverages,
            pendingCount: userMessages.filter((message) => message.evaluationStatus === 'pending').length,
            skippedCount: userMessages.filter((message) => message.evaluationStatus === 'skipped').length,
            unavailableMessages: userMessages.filter((message) => message.evaluationStatus === 'unavailable'),
        };
    }, [messages]);

    const { userMessages, turns, latestTurn, sessionScore, metricAverages, pendingCount, skippedCount, unavailableMessages } = assessment;
    const previousTurns = turns.slice(0, -1).reverse();
    const weakestMetric = metricAverages.length > 0 ? getWeakestMetric(metricAverages) : null;
    const latestCorrectionMessage = [...userMessages]
        .reverse()
        .find((message) => message.correctionStatus === 'ready' && message.correction) ?? null;
    const latestFeedbackMessage = [...userMessages]
        .reverse()
        .find((message) => message.correctionStatus === 'ready' || message.evaluationStatus === 'ready') ?? null;
    const latestFeedbackTurn = latestFeedbackMessage?.evaluation
        ? { message: latestFeedbackMessage, evaluation: latestFeedbackMessage.evaluation }
        : null;
    const latestRealtimeCorrection = latestFeedbackMessage?.correctionStatus === 'ready'
        ? latestFeedbackMessage
        : null;
    const showCoachContent = shouldShowCoachContent(turns.length, Boolean(latestCorrectionMessage));
    const realtimeTurnLps = userMessages.map((message) => getCurrentMessageLp(message));
    const tier = calculateTierProgress({
        tiers: TIERS,
        turnLps: [
            ...realtimeTurnLps,
            ...(showDeveloperLpControls ? developerLpDeltas : []),
        ],
    });
    const developerLpTotal = developerLpDeltas.reduce((sum, delta) => sum + delta, 0);
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

    useEffect(() => {
        if (!evaluationBatchStatus || evaluationBatchStatus.pendingCount <= 0) return;
        const timer = window.setInterval(() => setNowEpochMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [evaluationBatchStatus]);

    return (
        <aside className="relative flex h-full min-h-0 flex-col border-t border-[#483c2d]/10 bg-[#f4ece4]/75 backdrop-blur-xl print:border-0 print:bg-white lg:border-l lg:border-t-0">
            <MissionSuccessCelebration celebrations={missionCelebrations} />
            {printRoot ? createPortal(
                <PrintReport messages={messages} turns={turns} sessionScore={sessionScore} metricAverages={metricAverages} />,
                printRoot,
            ) : null}

            <div className="flex items-center justify-between border-b border-[#483c2d]/10 px-5 py-4 print:hidden">
                <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-[#6b5a4a]" />
                    <h2 className="font-bold tracking-tight text-[#483c2d]">영어 코치</h2>
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
                <StatusLine
                    pendingCount={pendingCount}
                    skippedCount={skippedCount}
                    unavailableMessages={unavailableMessages}
                    evaluationBatchStatus={evaluationBatchStatus}
                    nowEpochMs={nowEpochMs}
                />

                {!showCoachContent ? (
                    <section className="mt-4 rounded-lg border border-dashed border-[#483c2d]/20 bg-white/45 p-4 text-sm leading-relaxed text-[#6b5a4a]">
                        아바타와 영어로 대화하면 응답마다 자동으로 코칭이 붙습니다. 대화는 끊지 않고, 이 패널에서 점수와 교정 근거만 조용히 업데이트합니다.
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
                                            <p className="text-xs font-semibold uppercase tracking-normal text-[#6b5a4a]/70">자동 코칭 티어</p>
                                            <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1">
                                                <span className="break-words text-4xl font-black leading-none" style={{ color: tier.tier.text }}>
                                                    {tier.tier.label}
                                                </span>
                                                <span className="pb-1 text-sm font-bold text-[#6b5a4a]">{tier.lp} LP</span>
                                            </div>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-[#6b5a4a]">{tier.tier.subtitle}</p>
                                            <p className="mt-1 text-xs font-bold" style={{ color: tier.tier.text }}>
                                                {getTierTone(tier.tier.id, sessionScore)}
                                            </p>
                                            <div className="mt-3 h-3 overflow-hidden rounded-full border border-[#5b4939]/20 bg-[#cbb8a3] shadow-inner">
                                                <div
                                                    className="h-full rounded-full shadow-[0_0_10px_rgba(34,197,94,0.55)] transition-all duration-500"
                                                    style={{ width: `${tier.progress}%`, background: 'linear-gradient(90deg, #f97316 0%, #facc15 48%, #22c55e 100%)' }}
                                                />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-3 text-xs font-black text-[#483c2d]">
                                                <span>총 {tier.totalLp} LP</span>
                                                <span>{tier.nextTier ? `${tier.nextTier.label}까지 ${tier.nextTierRemainingLp} LP` : '최고 티어'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative mt-4 flex items-center justify-between gap-2 rounded-md bg-[#fdf8f4]/80 px-3 py-2">
                                        <div className="text-xs font-semibold text-[#6b5a4a]">
                                            더 높은 배지를 얻으려면 응답에 이유나 예시를 한 문장 더 붙여보세요.
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

                            {showDeveloperLpControls && (
                                <section className="rounded-lg border border-dashed border-[#9a4b36]/45 bg-[#fff7ed] p-4 shadow-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-sm font-black text-[#7a3b28]">Dev LP Controls</h3>
                                            <p className="mt-1 text-xs font-semibold text-[#8a5a42]">
                                                Test-only LP events. They reset on reload and are not saved to evaluation data.
                                            </p>
                                        </div>
                                        <div className="text-right text-xs font-black text-[#7a3b28]">
                                            <p>조정 {developerLpTotal > 0 ? '+' : ''}{developerLpTotal} LP</p>
                                            <p className="mt-1 text-[#8a5a42]">이벤트 {developerLpDeltas.length}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-5 gap-2">
                                        {[25, 100].map((delta) => (
                                            <button
                                                key={`add-${delta}`}
                                                type="button"
                                                onClick={() => setDeveloperLpDeltas((items) => [...items, delta])}
                                                className="flex min-h-10 items-center justify-center gap-1 rounded-md bg-[#2f6f4f] px-2 text-xs font-black text-white transition-colors hover:bg-[#265a40] focus:outline-none focus:ring-2 focus:ring-[#2f6f4f]/30"
                                                title={`Test LP +${delta}`}
                                            >
                                                <Plus className="h-4 w-4" />
                                                {delta}
                                            </button>
                                        ))}
                                        {[-25, -100].map((delta) => (
                                            <button
                                                key={`subtract-${delta}`}
                                                type="button"
                                                onClick={() => setDeveloperLpDeltas((items) => [...items, delta])}
                                                className="flex min-h-10 items-center justify-center gap-1 rounded-md bg-[#9a4b36] px-2 text-xs font-black text-white transition-colors hover:bg-[#7e3e2d] focus:outline-none focus:ring-2 focus:ring-[#9a4b36]/30"
                                                title={`Test LP ${delta}`}
                                            >
                                                <Minus className="h-4 w-4" />
                                                {Math.abs(delta)}
                                            </button>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setDeveloperLpDeltas([])}
                                            className="flex min-h-10 items-center justify-center rounded-md border border-[#7a3b28]/30 bg-white px-2 text-[#7a3b28] transition-colors hover:bg-[#f8e5d7] focus:outline-none focus:ring-2 focus:ring-[#7a3b28]/25"
                                            title="Reset test LP"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <p className="mt-3 text-xs font-semibold leading-relaxed text-[#7a3b28]">
                                        Promotion check: +100 should advance a tier. Demotion guard: -100 should not lower the earned badge.
                                    </p>
                                </section>
                            )}

                            <section className="rounded-lg border border-white/50 bg-white/70 p-4 shadow-sm">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="rounded-md bg-[#fdf8f4]/90 px-3 py-2">
                                        <p className="text-[11px] font-bold text-[#6b5a4a]/70">누적 응답</p>
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
                                    점수는 응답을 마지막까지 안정적으로 보정하고, LP는 꾸준히 대화를 확장하는 연습량을 반영합니다.
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

                            {(latestFeedbackTurn || latestRealtimeCorrection || latestCorrectionMessage) && (
                                <section className="max-h-[390px] shrink-0 overflow-y-auto rounded-lg border border-[#3d6f4a]/20 bg-white/80 shadow-sm">
                                    <div className="bg-[#edf5ed] px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="flex items-center gap-1 text-xs font-black uppercase tracking-normal text-[#29452c]">
                                                    <Sparkles className="h-3.5 w-3.5" />
                                                    다음엔 이렇게 말해보세요
                                                </p>
                                                <p className="mt-2 break-words text-xl font-black leading-snug text-[#243f27]">
                                                    {latestFeedbackTurn
                                                        ? getRetrySentence(latestFeedbackTurn)
                                                        : latestRealtimeCorrection?.correction?.suggested
                                                            || latestRealtimeCorrection?.content
                                                            || latestCorrectionMessage?.correction?.suggested
                                                            || latestCorrectionMessage?.content}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${latestFeedbackTurn ? getScoreAccent(getMetricScore(latestFeedbackTurn.evaluation, 'overall')) : 'bg-[#eef8f6] text-[#1f4f4a]'}`}>
                                                {latestFeedbackTurn
                                                    ? getMetricScore(latestFeedbackTurn.evaluation, 'overall')
                                                    : `${latestRealtimeCorrection?.correction?.provisionalScore
                                                        ?? latestCorrectionMessage?.correction?.provisionalScore
                                                        ?? '--'}점`}
                                            </span>
                                        </div>
                                        {(latestFeedbackTurn
                                            ? getCoachReason(latestFeedbackTurn.evaluation, latestFeedbackTurn.message.correction)
                                            : latestRealtimeCorrection?.correction?.reason || latestCorrectionMessage?.correction?.reason) && (
                                            <p className="mt-2 break-words text-xs font-semibold leading-relaxed text-[#3f6543]">
                                                {latestFeedbackTurn
                                                    ? getCoachReason(latestFeedbackTurn.evaluation, latestFeedbackTurn.message.correction)
                                                    : latestRealtimeCorrection?.correction?.reason || latestCorrectionMessage?.correction?.reason}
                                            </p>
                                        )}
                                        {!latestFeedbackTurn && (
                                            latestRealtimeCorrection?.correction?.contextReason
                                            || latestCorrectionMessage?.correction?.contextReason
                                        ) && (
                                            <p className="mt-1 break-words text-xs font-semibold leading-relaxed text-[#5e5549]">
                                                {getContextFitLabel(
                                                    latestRealtimeCorrection?.correction?.contextFit
                                                    || latestCorrectionMessage?.correction?.contextFit,
                                                )} · {latestRealtimeCorrection?.correction?.contextReason
                                                    || latestCorrectionMessage?.correction?.contextReason}
                                            </p>
                                        )}
                                        {!latestFeedbackTurn && Number.isFinite(
                                            latestRealtimeCorrection?.correction?.provisionalLp
                                            ?? latestCorrectionMessage?.correction?.provisionalLp,
                                        ) && (
                                            <p className="mt-1 text-xs font-black text-[#3d6f4a]">
                                                실시간 LP {(latestRealtimeCorrection?.correction?.provisionalLp
                                                    ?? latestCorrectionMessage?.correction?.provisionalLp
                                                    ?? 0) > 0 ? '+' : ''}
                                                {latestRealtimeCorrection?.correction?.provisionalLp
                                                    ?? latestCorrectionMessage?.correction?.provisionalLp} LP
                                            </p>
                                        )}
                                    </div>

                                    {latestFeedbackTurn && (
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
                                                <p className="font-bold text-[#483c2d]">최근 답변</p>
                                                <p className="mt-1 break-words">{latestFeedbackTurn.message.content}</p>
                                            </div>
                                            <div className="rounded-md bg-[#eef8f6] p-3 text-xs leading-relaxed text-[#265651]">
                                                <p className="flex items-center gap-1 font-bold text-[#1f4f4a]"><Target className="h-3.5 w-3.5" /> 집중 포인트</p>
                                                <p className="mt-1 break-words">{getLatestFocus(latestFeedbackTurn.evaluation)}</p>
                                            </div>
                                            {latestFeedbackTurn.evaluation.feedback.strength && (
                                                <div className="rounded-md bg-[#f8f1ea]/90 p-3 text-xs leading-relaxed text-[#5b4939]">
                                                    <p className="font-bold text-[#483c2d]">강점</p>
                                                    <p className="mt-1 break-words">{latestFeedbackTurn.evaluation.feedback.strength}</p>
                                                </div>
                                            )}
                                            <div className="rounded-md bg-[#fff7e8] p-3 text-xs leading-relaxed text-[#6b4f20]">
                                                <p className="font-bold text-[#5a421a]">다시 말하기</p>
                                                <p className="mt-1 break-words">교정된 문장으로 다시 말한 뒤, 같은 생각을 한 문장 더 붙여보세요.</p>
                                            </div>
                                        </div>

                                        <details className="mt-3 rounded-md bg-[#f8f1ea]/70 px-3 py-2 text-xs leading-relaxed text-[#6b5a4a]">
                                            <summary className="cursor-pointer font-bold text-[#483c2d]">View score evidence</summary>
                                            <p className="mt-1 break-words">
                                                {latestFeedbackTurn.evaluation.evidence.overall || latestFeedbackTurn.evaluation.cefrEstimate.reason}
                                            </p>
                                        </details>

                                        {latestFeedbackTurn.evaluation.calibrationNotes && latestFeedbackTurn.evaluation.calibrationNotes.length > 0 && (
                                            <p className="mt-3 rounded-md bg-[#f7ece8] px-3 py-2 text-xs leading-relaxed text-[#7a4b3a]">
                                                {latestFeedbackTurn.evaluation.calibrationNotes.join(' ')}
                                            </p>
                                        )}
                                        <p className="mt-3 text-xs leading-relaxed text-[#6b5a4a]">
                                            Level note {latestFeedbackTurn.evaluation.cefrEstimate.level}: {latestFeedbackTurn.evaluation.cefrEstimate.reason}
                                        </p>
                                    </div>
                                    )}
                                </section>
                            )}

                            <section className="flex min-h-[220px] max-h-[320px] flex-none flex-col rounded-lg border border-white/50 bg-white/70 p-4 shadow-sm">
                                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                                    <h3 className="text-sm font-bold text-[#483c2d]">Previous feedback</h3>
                                    <span className="shrink-0 text-xs font-semibold text-[#6b5a4a]/70">Total {previousTurns.length}</span>
                                </div>
                                {previousTurns.length === 0 ? (
                                    <p className="text-xs leading-relaxed text-[#6b5a4a]">응답이 쌓이면 이곳에서 이전 피드백을 스크롤로 다시 볼 수 있습니다.</p>
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
