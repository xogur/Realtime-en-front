'use client';

import {
    Activity,
    AlertCircle,
    BookOpen,
    CheckCircle2,
    Clock,
    Flag,
    Info,
    Minus,
    Plus,
    Printer,
    RotateCcw,
    Sparkles,
    Target,
    X,
} from 'lucide-react';
import { AnimatePresence, motion, useAnimate } from 'framer-motion';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useStore, type ChatMessage, type EvaluationBatchStatus, type PracticeMission, type TurnCorrection, type TurnEvaluation } from '@/stores/useStore';
import { useMissionCelebration, type MissionCelebrationPresentation } from '@/hooks/useMissionCelebration';
import { MissionSuccessAudio, useMissionSuccessSoundEnabled } from '@/lib/missionSuccessAudio';
import {
    clampScore,
    getCurrentMessageLp,
    getMetricScore,
    getMissionResultsFromCompletions,
} from '@/lib/missionLp';
import { calculateTierProgress } from '@/lib/tierProgress';
import { AssessmentPrintReport } from '@/components/AssessmentPrintReport';

type EvaluatedTurn = {
    message: ChatMessage;
    evaluation: TurnEvaluation;
};

const subscribeClientReady = () => () => undefined;
const getClientReadySnapshot = () => true;
const getServerReadySnapshot = () => false;

type MetricKey = 'grammar' | 'vocabulary' | 'relevance' | 'fluency' | 'interaction';
type TierId = 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master';
type AssessmentDetailTab = 'feedback' | 'evaluation';

type MetricSnapshot = { key: MetricKey; label: string; value: number };

export type ReportErrorPattern = {
    code: string;
    label: string;
    meaning: string;
    advice: string;
    count: number;
    total: number;
    original: string;
    suggested: string;
    reason: string;
};

const MISSION_CELEBRATION_VISIBLE_MS = 2600;
const TIER_PROMOTION_VISIBLE_MS = 2200;
const ERROR_PATTERN_GUIDES: Record<string, {
    label: string;
    meaning: string;
    advice: string;
    question: string;
    success: string;
    modeling: string;
    practice: string;
}> = {
    article: {
        label: '관사',
        meaning: '명사 앞의 a, an, the가 빠지거나 상황과 다르게 사용됐습니다.',
        advice: '처음 말하는 하나의 대상은 a/an, 이미 언급했거나 특정한 대상은 the를 씁니다.',
        question: 'Describe a place you visited recently.',
        success: '3문장 안에서 a, an, the 누락 1회 이하',
        modeling: '장소를 처음 말할 때와 다시 언급할 때의 관사 사용을 비교합니다.',
        practice: '사람·장소·사물을 바꾸어 같은 문장 구조를 반복합니다.',
    },
    verb_tense: {
        label: '동사 시제',
        meaning: '말하는 시간과 동사의 형태가 서로 맞지 않았습니다.',
        advice: 'yesterday·last week처럼 끝난 일을 말할 때는 동사를 과거형으로 바꿉니다.',
        question: 'Tell me what you did last weekend.',
        success: '3문장 안에서 과거 시제 오류 1회 이하',
        modeling: '핵심 동사의 현재형과 과거형을 나란히 보여줍니다.',
        practice: '시간·장소·사람을 바꾸어 과거 경험 문장을 반복합니다.',
    },
    subject_verb_agreement: {
        label: '주어-동사 일치',
        meaning: '주어가 누구인지에 맞는 동사 형태를 사용하지 못했습니다.',
        advice: '현재형에서 he/she/it 뒤의 일반동사에는 보통 -s 또는 -es를 붙입니다.',
        question: 'Tell me about someone in your family.',
        success: '3문장 안에서 주어-동사 일치 오류 1회 이하',
        modeling: 'I/you와 he/she 뒤의 동사 형태를 대조합니다.',
        practice: '주어를 바꾸면서 같은 의미의 문장을 반복합니다.',
    },
    preposition: {
        label: '전치사',
        meaning: '시간·장소·동작과 함께 쓰는 전치사의 조합이 맞지 않았습니다.',
        advice: '전치사는 단어 하나보다 at night, on Monday, interested in처럼 묶어서 익힙니다.',
        question: 'Tell me about your weekday routine.',
        success: '시간·장소 전치사 오류 1회 이하',
        modeling: '교정 문장의 전치사와 함께 쓰이는 표현을 묶어 보여줍니다.',
        practice: '시간과 장소만 바꾸어 같은 표현 덩어리를 반복합니다.',
    },
    word_order: {
        label: '어순',
        meaning: '영어 문장에서 주어·동사·목적어 또는 수식어의 위치가 어긋났습니다.',
        advice: '기본문장은 ‘주어 + 동사 + 목적어’ 순서로 먼저 만든 뒤 시간·장소를 붙입니다.',
        question: 'Explain how you usually spend your evening.',
        success: '3문장 모두 주어-동사-목적어 순서 유지',
        modeling: '교정 전후 문장에서 움직인 단어의 위치를 표시합니다.',
        practice: '핵심 단어를 카드처럼 재배열해 완전한 문장을 만듭니다.',
    },
    sentence_fragment: {
        label: '불완전 문장',
        meaning: '답변에 주어나 핵심 동사가 없어 하나의 완전한 문장이 되지 않았습니다.',
        advice: '짧게 답하더라도 ‘누가 + 무엇을 한다/어떻다’가 드러나는지 확인합니다.',
        question: 'Tell me about your favorite activity in three sentences.',
        success: '주어와 동사가 있는 완전한 문장 3개',
        modeling: '짧은 구와 완전한 문장을 나란히 비교합니다.',
        practice: '짧은 답변에 주어·동사·이유를 하나씩 덧붙입니다.',
    },
    plural: {
        label: '단수·복수',
        meaning: '명사의 개수와 단수·복수 형태가 맞지 않았습니다.',
        advice: '셀 수 있는 명사가 둘 이상이면 보통 복수형을 쓰고, 단수면 a/an도 확인합니다.',
        question: 'Tell me about things you use every day.',
        success: '셀 수 있는 명사의 단수·복수 오류 1회 이하',
        modeling: '수량 표현과 명사의 단수·복수 형태를 함께 보여줍니다.',
        practice: '숫자와 수량만 바꾸어 같은 명사 문장을 반복합니다.',
    },
    pronoun: {
        label: '대명사',
        meaning: 'it, they, he, she 등이 가리키는 대상이나 형태가 분명하지 않았습니다.',
        advice: '대명사가 앞의 어떤 명사를 대신하는지, 단수·복수와 성별이 맞는지 확인합니다.',
        question: 'Tell me about a person who helped you.',
        success: '대명사의 대상이 모든 문장에서 명확함',
        modeling: '명사와 이를 대신하는 대명사를 선으로 연결합니다.',
        practice: '사람과 사물을 바꾸며 대명사 문장을 다시 만듭니다.',
    },
    word_choice: {
        label: '단어 선택',
        meaning: '뜻은 비슷하지만 현재 문맥에서는 잘 쓰지 않는 단어나 조합을 사용했습니다.',
        advice: '단어를 따로 외우기보다 make a decision처럼 자연스럽게 함께 쓰는 표현으로 익힙니다.',
        question: 'Describe something you enjoyed recently.',
        success: '핵심 표현 2개를 문맥에 맞게 사용',
        modeling: '직역 표현과 자연스러운 영어 표현의 쓰임을 비교합니다.',
        practice: '같은 의미를 다른 상황에 맞는 표현으로 바꾸어 말합니다.',
    },
    connector: {
        label: '문장 연결',
        meaning: '이유·결과·대조 관계에 맞지 않는 연결어를 사용했거나 필요한 연결이 빠졌습니다.',
        advice: '이유는 because, 결과는 so, 대조는 but처럼 문장 사이의 관계에 맞춰 선택합니다.',
        question: 'What do you like, and why?',
        success: 'because, so, but 중 하나로 2문장 연결',
        modeling: '두 짧은 문장을 연결어 하나로 합치는 과정을 보여줍니다.',
        practice: '이유·결과·대조 관계를 바꾸어 문장을 연결합니다.',
    },
};

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

type TierPromotionPresentation = {
    id: string;
    fromTier: TierConfig;
    toTier: TierConfig;
    delta: number;
    totalLp: number;
    nextTier: TierConfig | null;
    nextTierRemainingLp: number;
};

const METRICS: Array<{ key: MetricKey; label: string }> = [
    { key: 'grammar', label: '문법' },
    { key: 'vocabulary', label: '어휘' },
    { key: 'relevance', label: '응답 적합도' },
    { key: 'fluency', label: '문장 완성도' },
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

export function getEvaluationReliabilityNotice(confidence: string): string | null {
    return confidence.toLowerCase() === 'low'
        ? 'AI 응답이 불안정해 임시 기준으로 평가했습니다.'
        : null;
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

export function getPracticeMissionCandidates(turn: EvaluatedTurn, assistantPrompt: string): PracticeMission[] {
    const fallbackMissions = createFallbackPracticeMissions(turn, assistantPrompt);
    if (turn.evaluation.confidence.trim().toLowerCase() === 'low') {
        return fallbackMissions;
    }
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

function getTierPromotionParticles(id: string) {
    const seed = missionSeed(id);
    return Array.from({ length: 18 }, (_, index) => {
        const angle = ((seed + index * 37) % 160) - 80;
        const distance = 46 + ((seed + index * 19) % 72);
        return {
            id: `${id}:tier:${index}`,
            left: 50 + Math.sin((angle * Math.PI) / 180) * 34,
            top: 48 + Math.cos((angle * Math.PI) / 180) * 18,
            color: ['#facc15', '#fff7ad', '#22c55e', '#9ee7ff', '#ffffff'][index % 5],
            x: Math.sin((angle * Math.PI) / 180) * distance,
            y: -28 - ((seed + index * 13) % 64),
        };
    });
}

function getTierIndex(tierId: TierId): number {
    return TIERS.findIndex((tier) => tier.id === tierId);
}

function useTierPromotionCelebration({
    tier,
    latestDelta,
    totalLp,
    nextTier,
    nextTierRemainingLp,
    visibleMs = TIER_PROMOTION_VISIBLE_MS,
}: {
    tier: TierConfig;
    latestDelta: number;
    totalLp: number;
    nextTier: TierConfig | null;
    nextTierRemainingLp: number;
    visibleMs?: number;
}) {
    const previousTier = useRef<TierConfig | null>(null);
    const clearTimer = useRef<number | null>(null);
    const [presentation, setPresentation] = useState<TierPromotionPresentation | null>(null);

    useEffect(() => {
        const previous = previousTier.current;
        previousTier.current = tier;

        if (!previous) return;
        const previousIndex = getTierIndex(previous.id);
        const nextIndex = getTierIndex(tier.id);
        if (previousIndex < 0 || nextIndex <= previousIndex) return;

        const nextPresentation: TierPromotionPresentation = {
            id: `${previous.id}-to-${tier.id}-${totalLp}-${Date.now()}`,
            fromTier: previous,
            toTier: tier,
            delta: latestDelta,
            totalLp,
            nextTier,
            nextTierRemainingLp,
        };

        if (clearTimer.current) window.clearTimeout(clearTimer.current);
        setPresentation(nextPresentation);
        clearTimer.current = window.setTimeout(() => {
            setPresentation(null);
            clearTimer.current = null;
        }, visibleMs);
    }, [latestDelta, nextTier, nextTierRemainingLp, tier, totalLp, visibleMs]);

    useEffect(() => () => {
        if (clearTimer.current) window.clearTimeout(clearTimer.current);
    }, []);

    return presentation;
}

function getMissionKindLabel(kind: PracticeMission['kind']): string {
    if (kind === 'grammar') return '문법';
    if (kind === 'tense') return '시제';
    if (kind === 'connector') return '연결';
    if (kind === 'question') return '질문';
    if (kind === 'length') return '길이';
    if (kind === 'interaction') return '대화';
    return '표현';
}

function getMissionSupportLines(mission: PracticeMission) {
    return {
        usage: mission.usageContext || mission.successHint,
        example: mission.exampleSentence,
    };
}

function usePresentedMissions(
    missions: PracticeMission[],
    holdReplacements: boolean,
    markMissionsPresented: (missionIds: readonly string[]) => void,
) {
    const [displayedMissions, setDisplayedMissions] = useState(missions);
    const [enteringMissionIds, setEnteringMissionIds] = useState<Set<string>>(() => new Set());
    const displayedIdsRef = useRef(new Set(missions.map((mission) => mission.id)));
    const enteringTimerRef = useRef<number | null>(null);

    /* eslint-disable react-hooks/set-state-in-effect -- held mission cards must swap before paint to avoid a CLEAR flicker */
    useLayoutEffect(() => {
        if (holdReplacements) return;

        const nextIds = new Set(missions.map((mission) => mission.id));
        const enteringIds = new Set(
            missions
                .map((mission) => mission.id)
                .filter((missionId) => !displayedIdsRef.current.has(missionId)),
        );

        displayedIdsRef.current = nextIds;
        setDisplayedMissions(missions);
        markMissionsPresented([...nextIds]);

        if (enteringIds.size > 0) {
            setEnteringMissionIds(enteringIds);
            if (enteringTimerRef.current !== null) window.clearTimeout(enteringTimerRef.current);
            enteringTimerRef.current = window.setTimeout(() => {
                setEnteringMissionIds(new Set());
                enteringTimerRef.current = null;
            }, 900);
        } else if (enteringTimerRef.current === null) {
            setEnteringMissionIds(new Set());
        }
    }, [holdReplacements, markMissionsPresented, missions]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => () => {
        if (enteringTimerRef.current !== null) window.clearTimeout(enteringTimerRef.current);
    }, []);

    return { displayedMissions, enteringMissionIds };
}

function ActiveMissionsPanel({
    missions,
    completedMissionIds,
    holdReplacements,
}: {
    missions: PracticeMission[];
    completedMissionIds: Set<string>;
    holdReplacements: boolean;
}) {
    const missionSlots = [0, 1, 2];
    const markMissionsPresented = useStore((state) => state.markMissionsPresented);
    const { displayedMissions, enteringMissionIds } = usePresentedMissions(
        missions,
        holdReplacements,
        markMissionsPresented,
    );

    return (
        <section className="group relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#483c2d]/10 bg-[#f8f1ea]/90 p-2.5 shadow-[0_8px_24px_rgba(72,60,45,0.08)]">
            <div className="flex shrink-0 items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-black text-[#5b4939]">
                        <Flag className="h-3.5 w-3.5 text-[#a8792f]" />
                        오늘의 퀘스트
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-[#7a695b]">표현을 쓰면 완료되고 새 목표가 들어옵니다.</p>
                </div>
                <span className="shrink-0 rounded-md border border-[#c59b55]/25 bg-[#fff4d9] px-2.5 py-0.5 font-mono text-xs font-black text-[#7a540f]">{displayedMissions.length}/3</span>
            </div>
            <div className="mt-1.5 grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-2 overflow-hidden sm:grid-cols-3">
                {missionSlots.map((slotIndex) => {
                    const mission = displayedMissions[slotIndex];

                    if (!mission) {
                        return (
                            <motion.div
                                key={`mission-slot-${slotIndex}`}
                                className="relative min-h-0 overflow-hidden rounded-lg border border-dashed border-[#8a6f5a]/20 bg-white/45 px-2.5 py-1.5"
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#eee4da] text-[10px] font-black text-[#6b5a4a]">
                                        {slotIndex + 1}
                                    </span>
                                    <span className="text-[11px] font-black text-[#6b5a4a]">대기 슬롯</span>
                                </div>
                                <p className="mt-2 line-clamp-3 text-xs font-medium leading-snug text-[#8a796b]">
                                    다음 응답 평가 후 새 미션이 표시됩니다.
                                </p>
                            </motion.div>
                        );
                    }

                    const completed = completedMissionIds.has(mission.id);
                    const entering = enteringMissionIds.has(mission.id);
                    const support = getMissionSupportLines(mission);

                    return (
                        <div
                            key={mission.id}
                            data-mission-id={mission.id}
                            data-mission-entering={entering ? 'true' : undefined}
                            className={`relative min-h-0 overflow-hidden rounded-lg border px-2.5 py-1.5 shadow-[0_3px_10px_rgba(72,60,45,0.07)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(72,60,45,0.13)] ${entering ? 'mission-card-enter' : ''} ${completed
                                ? 'border-[#83926f]/40 bg-[#edf1e8]'
                                : 'border-[#b9873d]/30 bg-[#fffaf5]'}`}
                        >
                            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-[#b9873d]/75" />
                            {entering && (
                                <motion.span
                                    aria-hidden="true"
                                    className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-transparent via-[#f2d89d]/65 to-transparent"
                                    initial={{ x: '-120%', opacity: 0 }}
                                    animate={{ x: '340%', opacity: [0, 1, 0] }}
                                    transition={{ duration: 0.85, ease: 'easeOut' }}
                                />
                            )}
                            {completed && (
                                <div
                                    aria-hidden="true"
                                    className="absolute inset-0 z-20 flex items-center justify-center bg-[#081a18]/85 backdrop-blur-sm"
                                >
                                    <div
                                        className="mission-success-enter rounded-md border border-[#d8ff73]/40 bg-[#d8ff73]/10 px-3 py-1 text-xs font-black text-[#d8ff73]"
                                    >
                                        CLEAR
                                    </div>
                                </div>
                            )}
                            <div className="relative z-10 flex items-center gap-1.5 overflow-hidden pt-1">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#59483b] text-[10px] font-black text-white shadow-sm">
                                    {slotIndex + 1}
                                </span>
                                <span className="min-w-0 truncate text-[11px] font-black text-[#6b5a4a]">
                                    {getMissionKindLabel(mission.kind)} 퀘스트
                                </span>
                                <span className="ml-auto shrink-0 rounded-md border border-[#71805f]/30 bg-[#dfe8d8] px-1.5 py-0.5 text-[10px] font-black text-[#41543a] shadow-sm">+{mission.rewardLp} LP</span>
                            </div>
                            <p className="relative z-10 mt-1.5 line-clamp-2 break-words text-[14px] font-black leading-[1.2] text-[#2f261f]" title={mission.target}>
                                {mission.target}
                            </p>
                            <div className="relative z-10 mt-1 grid gap-1">
                                <p className="flex min-w-0 items-start gap-1 rounded-md bg-[#edf1e8] px-2 py-1 text-[10px] font-bold leading-tight text-[#506047]" title={support.usage}>
                                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                                    <span className="line-clamp-2">활용: {support.usage}</span>
                                </p>
                                {support.example && (
                                    <p className="flex min-w-0 items-center gap-1 rounded-md bg-[#f1e9e1] px-2 py-0.5 text-[10px] font-bold leading-tight text-[#7a695b]" title={support.example}>
                                        <BookOpen className="h-3 w-3 shrink-0" />
                                        <span className="truncate">예: {support.example}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function getTierSummary(tierId: TierId): string {
    if (tierId === 'master') return '자연스럽고 자신감 있는 대화를 이어가고 있어요.';
    if (tierId === 'diamond') return '정확하고 다양한 표현을 안정적으로 사용해요.';
    if (tierId === 'platinum') return '유창성과 정확성의 균형이 좋은 단계예요.';
    if (tierId === 'gold') return '이유와 예시로 답변을 풍부하게 만들고 있어요.';
    if (tierId === 'silver') return '문장 구조가 점점 안정되고 있어요.';
    if (tierId === 'bronze') return '기본 표현을 꾸준히 쌓아가는 단계예요.';
    return '첫 대화 습관을 만들어가는 중이에요.';
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
        <div className="flex min-w-0 flex-col items-center justify-start gap-1" title={tier.label}>
            <TierBadge tier={tier} size={28} />
            <span className="flex h-3 w-full items-center justify-center whitespace-nowrap text-center text-[8px] font-bold leading-[1.2] text-[#7a695b] xl:text-[9px]">{tier.label}</span>
        </div>
    );
}

function TierPromotionCelebration({ presentation }: { presentation: TierPromotionPresentation | null }) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const particles = presentation && !prefersReducedMotion ? getTierPromotionParticles(presentation.id) : [];

    return (
        <AnimatePresence>
            {presentation && (
                <motion.div
                    key={presentation.id}
                    role="status"
                    aria-live="polite"
                    className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-lg bg-[#1d1611]/70"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0.01 : 0.16 }}
                >
                    {!prefersReducedMotion && (
                        <>
                            <motion.div
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#facc15]/25 blur-2xl"
                                initial={{ scale: 0.1, opacity: 0 }}
                                animate={{ scale: [0.1, 1.2, 0.85], opacity: [0, 0.9, 0.5] }}
                                transition={{ duration: 0.85, ease: 'easeOut' }}
                            />
                            <motion.div
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 h-32 w-56 -translate-x-1/2 -translate-y-1/2 border-y border-[#fff4b4]/70"
                                initial={{ scaleX: 0.1, opacity: 0 }}
                                animate={{ scaleX: [0.1, 1.15, 0.95], opacity: [0, 1, 0.55] }}
                                transition={{ duration: 0.7, ease: 'easeOut' }}
                            />
                            <motion.div
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#fff7ad]/70"
                                initial={{ scale: 0.2, opacity: 0 }}
                                animate={{ scale: [0.2, 2.4], opacity: [0.8, 0] }}
                                transition={{ duration: 0.9, ease: 'easeOut' }}
                            />
                            {particles.map((particle) => (
                                <motion.span
                                    key={particle.id}
                                    aria-hidden="true"
                                    className="absolute h-1.5 w-1.5 rounded-full"
                                    style={{
                                        left: `${particle.left}%`,
                                        top: `${particle.top}%`,
                                        backgroundColor: particle.color,
                                        boxShadow: `0 0 12px ${particle.color}`,
                                    }}
                                    initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
                                    animate={{ x: particle.x, y: particle.y, scale: [0.4, 1, 0.2], opacity: [0, 1, 0] }}
                                    transition={{ duration: 0.95, ease: 'easeOut' }}
                                />
                            ))}
                        </>
                    )}

                    <div className="absolute inset-0 flex items-center justify-center px-4">
                        <motion.div
                            className="relative flex min-w-0 flex-col items-center text-center"
                            initial={prefersReducedMotion ? false : { y: 12, scale: 0.92, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: -8, scale: 0.96, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.8 }}
                        >
                            <div className="relative flex items-center justify-center">
                                {!prefersReducedMotion && (
                                    <>
                                        <motion.div
                                            aria-hidden="true"
                                            className="absolute -left-20 h-12 w-20 rounded-l-full border-l-2 border-t-2 border-[#fff7ad]/70"
                                            initial={{ x: 28, scaleX: 0.25, opacity: 0 }}
                                            animate={{ x: 0, scaleX: 1, opacity: 0.85 }}
                                            transition={{ delay: 0.12, duration: 0.38, ease: 'easeOut' }}
                                        />
                                        <motion.div
                                            aria-hidden="true"
                                            className="absolute -right-20 h-12 w-20 rounded-r-full border-r-2 border-t-2 border-[#fff7ad]/70"
                                            initial={{ x: -28, scaleX: 0.25, opacity: 0 }}
                                            animate={{ x: 0, scaleX: 1, opacity: 0.85 }}
                                            transition={{ delay: 0.12, duration: 0.38, ease: 'easeOut' }}
                                        />
                                    </>
                                )}
                                <motion.div
                                    initial={prefersReducedMotion ? false : { scale: 0.3, rotate: -10, opacity: 0 }}
                                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                    transition={{ delay: 0.08, type: 'spring', stiffness: 460, damping: 20 }}
                                >
                                    <TierBadge tier={presentation.toTier} size={76} />
                                </motion.div>
                            </div>
                            <motion.p
                                className="mt-2 rounded-full border border-[#fff2a8]/60 bg-[#fff7d6]/95 px-3 py-1 text-[10px] font-black tracking-normal text-[#7a540f]"
                                initial={prefersReducedMotion ? false : { y: 8, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.22, duration: 0.22 }}
                            >
                                PROMOTED
                            </motion.p>
                            <motion.p
                                className="mt-1 text-2xl font-black leading-none text-white drop-shadow"
                                initial={prefersReducedMotion ? false : { y: 10, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.28, duration: 0.25 }}
                            >
                                {presentation.toTier.label} 달성
                            </motion.p>
                            <motion.p
                                className="mt-1 max-w-[220px] truncate text-xs font-bold text-[#fff4c7]"
                                initial={prefersReducedMotion ? false : { y: 8, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.34, duration: 0.25 }}
                                title={presentation.nextTier ? `${presentation.nextTier.label}까지 ${presentation.nextTierRemainingLp} LP` : '최고 티어'}
                            >
                                {presentation.delta > 0 ? `▲ ${presentation.delta} LP · ` : ''}
                                총 {presentation.totalLp} LP · {presentation.nextTier ? `${presentation.nextTier.label}까지 ${presentation.nextTierRemainingLp} LP` : '최고 티어'}
                            </motion.p>
                        </motion.div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function TierProgressBar({
    value,
    highlight,
    missionBonus,
    latestDelta,
    pulseKey,
}: {
    value: number;
    highlight: boolean;
    missionBonus: number;
    latestDelta: number;
    pulseKey?: string | number;
}) {
    const prefersReducedMotion = usePrefersReducedMotion();

    return (
        <div
            role="progressbar"
            aria-label="티어 LP 진행도"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value)}
            className="relative mt-2 h-3.5 overflow-visible rounded-full border border-[#483c2d]/15 bg-[#d8d0c5] shadow-inner"
        >
            {highlight && !prefersReducedMotion ? (
                <motion.span
                    key={`bar-pulse-${pulseKey ?? latestDelta}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-10 rounded-full"
                    initial={{ boxShadow: '0 0 0 0 rgba(134,164,98,0)', scaleY: 1 }}
                    animate={{
                        boxShadow: [
                            '0 0 0 0 rgba(134,164,98,0)',
                            '0 0 0 5px rgba(134,164,98,0.18), 0 0 24px rgba(111,145,72,0.62)',
                            '0 0 0 2px rgba(134,164,98,0.1), 0 0 10px rgba(111,145,72,0.24)',
                        ],
                        scaleY: [1, 1.35, 1],
                    }}
                    transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}
                />
            ) : null}
            {highlight && latestDelta > 0 && !prefersReducedMotion ? (
                <motion.span
                    key={`bar-delta-${pulseKey ?? latestDelta}`}
                    aria-live="polite"
                    className="absolute -right-1 -top-8 z-10 rounded-md border border-[#496348]/25 bg-[#f1f7eb] px-2 py-1 font-mono text-[10px] font-black tabular-nums text-[#31532d] shadow-[0_4px_14px_rgba(76,102,57,0.28)]"
                    initial={{ opacity: 0, y: 5, scale: 0.92 }}
                    animate={{ opacity: [0, 1, 1, 0], y: [5, 0, 0, -5], scale: [0.92, 1.04, 1, 0.98] }}
                    transition={{ duration: 1.8, times: [0, 0.18, 0.72, 1], ease: 'easeOut' }}
                >
                    {missionBonus > 0 ? `미션 +${missionBonus} LP` : `+${latestDelta} LP`}
                </motion.span>
            ) : null}
            <motion.div
                data-testid="tier-progress-fill"
                className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#3f6139] via-[#648451] to-[#8fae69] shadow-[0_1px_4px_rgba(54,86,48,0.42)] transition-[width] duration-700 ease-out"
                initial={false}
                animate={{
                    filter: highlight
                        ? ['brightness(1)', 'brightness(1.42) saturate(1.2)', 'brightness(1)']
                        : 'brightness(1)',
                }}
                // Keep the real value in CSS even if motion is interrupted by a
                // concurrent evaluation render. This is the visual source of truth.
                style={{ width: `${value}%`, minWidth: value > 0 ? 10 : 0 }}
                transition={{
                    filter: { duration: prefersReducedMotion ? 0.01 : 1.15, ease: 'easeOut' },
                }}
            >
                {highlight && !prefersReducedMotion ? (
                    <motion.span
                        key={`bar-sweep-${pulseKey ?? latestDelta}`}
                        aria-hidden="true"
                        className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/80 to-transparent"
                        initial={{ left: '-35%' }}
                        animate={{ left: '115%' }}
                        transition={{ duration: 1.05, ease: 'easeInOut' }}
                    />
                ) : null}
            </motion.div>
        </div>
    );
}

function MetricBar({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
    const prefersReducedMotion = usePrefersReducedMotion();

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#665448]">
                <span>{label}</span>
                <motion.span
                    className="font-mono font-black tabular-nums text-[#3c3028]"
                    animate={prefersReducedMotion ? undefined : {
                        scale: highlight ? [1, 1.18, 1] : 1,
                        color: highlight ? ['#3c3028', '#4f6a40', '#3c3028'] : '#3c3028',
                    }}
                    transition={{ duration: highlight ? 0.7 : 0.2, ease: 'easeOut' }}
                >
                    {value}
                </motion.span>
            </div>
            <motion.div
                className="h-2 overflow-hidden rounded-full bg-[#483c2d]/10"
                animate={prefersReducedMotion ? undefined : {
                    boxShadow: highlight
                        ? ['0 0 0 rgba(113,128,95,0)', '0 0 14px rgba(113,128,95,0.35)', '0 0 0 rgba(113,128,95,0)']
                        : '0 0 0 rgba(113,128,95,0)',
                }}
                transition={{ duration: highlight ? 0.9 : 0.2, ease: 'easeOut' }}
            >
                <motion.div
                    className="h-full rounded-full bg-[#7b8b67]"
                    initial={prefersReducedMotion ? false : { width: 0 }}
                    animate={{
                        width: `${clampScore(value)}%`,
                        backgroundColor: highlight ? ['#7b8b67', '#a8c27f', '#7b8b67'] : '#7b8b67',
                    }}
                    transition={prefersReducedMotion
                        ? { duration: 0.01 }
                        : {
                            width: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
                            backgroundColor: { duration: 0.9, ease: 'easeOut' },
                        }}
                />
            </motion.div>
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

const EVALUATION_BATCH_COUNTDOWN_MS = 30_000;

export function getBatchCountdown(status: EvaluationBatchStatus | null, nowEpochMs: number): string | null {
    if (!status || status.pendingCount <= 0) return null;
    if (status.nextFlushAtEpochMs) {
        return formatCountdown(Math.min(
            EVALUATION_BATCH_COUNTDOWN_MS,
            status.nextFlushAtEpochMs - nowEpochMs,
        ));
    }
    return formatCountdown(EVALUATION_BATCH_COUNTDOWN_MS);
}

export function useCountdownClock(active: boolean): number {
    const [nowEpochMs, setNowEpochMs] = useState(() => Date.now());

    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setNowEpochMs(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);

    return nowEpochMs;
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
    const prefersReducedMotion = usePrefersReducedMotion();

    if (pendingCount > 0) {
        const queuedCount = evaluationBatchStatus?.pendingCount ?? pendingCount;
        const turnsUntilEvaluation = evaluationBatchStatus
            ? Math.max(0, evaluationBatchStatus.maxTurns - evaluationBatchStatus.pendingCount)
            : null;
        const countdown = getBatchCountdown(evaluationBatchStatus, nowEpochMs);
        const isEvaluatingNow = evaluationBatchStatus?.phase === 'evaluating'
            || (evaluationBatchStatus?.inFlightCount ?? 0) > 0;

        return (
            <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden rounded-lg border border-[#c59b55]/20 bg-[#fff6e5] px-3 py-2 text-xs font-medium text-[#6b5a4a]">
                <Clock className="relative h-4 w-4 text-[#9d6f2a]" />
                <span>{pendingCount}개 응답을 평가 대기 중입니다.</span>
                <span className="relative font-bold text-[#8a5a22]">
                    {isEvaluatingNow
                        ? '평가 요청됨. 결과 수신 중'
                        : `${countdown ?? '30초'} 이내 또는 ${turnsUntilEvaluation ?? 4}개 발화 후 평가`}
                </span>
                {queuedCount !== pendingCount ? (
                    <span className="text-[#8a5a22]/65">큐 {queuedCount}개</span>
                ) : null}
            </div>
        );
    }

    if (unavailableMessages.length > 0) {
        const codes = Array.from(new Set(unavailableMessages.map((message) => message.evaluationErrorCode).filter(Boolean)));
        return (
            <div className="flex items-center gap-2 rounded-lg border border-[#b46f5a]/20 bg-[#f8ebe6] px-3 py-2 text-xs font-medium text-[#7a4b3a]">
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
            <div className="flex items-center gap-2 rounded-lg border border-[#483c2d]/10 bg-white/45 px-3 py-2 text-xs font-medium text-[#6b5a4a]">
                <CheckCircle2 className="h-4 w-4" />
                <span>{skippedCount}개 응답은 평가 대상에서 제외했습니다.</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 rounded-lg border border-[#83926f]/20 bg-[#edf1e8] px-3 py-2 text-xs font-medium text-[#506047]">
            <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-[#71805f] opacity-40 ${prefersReducedMotion ? '' : 'animate-ping'}`} />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#71805f]" />
            </span>
            <span>자동 평가 준비 완료</span>
        </div>
    );
}

function MissionSuccessCelebration({ presentation }: { presentation: MissionCelebrationPresentation | null }) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const particles = presentation && !prefersReducedMotion ? getCelebrationParticles(presentation.id) : [];

    return (
        <div
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center print:hidden"
            role="status"
            aria-live="polite"
        >
            {presentation && (
                    <div
                        data-testid="mission-success-celebration"
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        {!prefersReducedMotion && (
                            <motion.div
                                aria-hidden="true"
                                className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(248,214,109,0.28),transparent_48%)]"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 1, 0] }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.2, ease: 'easeOut' }}
                            />
                        )}
                <motion.div
                    className="mission-success-enter w-[min(92%,430px)]"
                >
                    <div className="relative overflow-hidden rounded-lg border border-[#f8d66d]/70 bg-[#1f241b]/95 px-5 py-4 text-white shadow-[0_22px_52px_rgba(31,36,27,0.34)]">
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
                            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#22c55e] via-[#f8d66d] to-[#5eead4]"
                            initial={{ scaleX: 0, transformOrigin: 'left' }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.55, ease: 'easeOut' }}
                        />
                        <div className="relative flex items-start gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#f8d66d] text-[#1f241b] shadow-[0_0_20px_rgba(248,214,109,0.42)]">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-black uppercase tracking-normal text-[#f8d66d]">QUEST CLEAR</span>
                                    <span className="rounded-full bg-white/12 px-2 py-0.5 text-xs font-black text-[#f8d66d]">+{presentation.totalLp} LP</span>
                                </div>
                                <p className="mt-1 text-lg font-black leading-none text-white">
                                    미션 {presentation.cards.length}개 완료
                                </p>
                                <div className="mt-1 space-y-1">
                                    {presentation.cards.slice(0, 3).map((card) => (
                                        <p key={card.missionId} className="truncate text-xs font-bold leading-snug text-white/78">
                                            {card.title}: {card.target}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
                    </div>
                )}
        </div>
    );
}

function FeedbackCard({ turn, compact = false }: { turn: EvaluatedTurn; compact?: boolean }) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const evaluation = turn.evaluation;
    const score = getMetricScore(evaluation, 'overall');
    const correction = turn.message.correction?.suggested || evaluation.correction.suggested;
    const reason = evaluation.evidence.overall || turn.message.correction?.reason || evaluation.correction.reason;
    const reliabilityNotice = getEvaluationReliabilityNotice(evaluation.confidence);

    return (
        <motion.article
            layout
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={prefersReducedMotion ? undefined : { y: -1 }}
            className="min-w-0 rounded-lg border border-[#483c2d]/10 bg-[#fffaf5] p-3 transition-colors hover:border-[#83926f]/30 hover:bg-white"
        >
            <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-xs font-bold leading-relaxed text-[#483c2d]">{turn.message.content}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black ${getScoreAccent(score)}`}>{score}점</span>
            </div>
            <p className="mt-2 break-words text-xs leading-relaxed text-[#7a695b]">{evaluation.feedback.summary}</p>
            {reliabilityNotice && (
                <p className="mt-2 rounded-md border border-[#c59b55]/15 bg-[#fff6e5] px-2 py-1.5 text-xs font-semibold leading-relaxed text-[#7a5a23]">
                    {reliabilityNotice}
                </p>
            )}
            {correction && (
                <p className="mt-2 break-words rounded-md border border-[#83926f]/15 bg-[#edf1e8] px-2 py-1.5 text-xs leading-relaxed text-[#506047]">
                    <span className="font-bold text-[#496348]">교정:</span> {correction}
                </p>
            )}
            {!compact && reason && (
                <p className="mt-2 break-words text-xs leading-relaxed text-[#6b5a4a]">
                    <span className="font-bold text-[#496348]">근거:</span> {reason}
                </p>
            )}
        </motion.article>
    );
}

type CorrectionCoachCardProps = {
    sentence: string;
    reason?: string;
    score: string;
    scoreClassName: string;
    context?: string;
    lp: number;
    lpIsFinal: boolean;
};

type StoppableAnimation = { stop: () => void };

function stopAnimations(animations: StoppableAnimation[]) {
    animations.forEach((animation) => animation.stop());
    animations.length = 0;
}

export function CorrectionCoachCard({
    sentence,
    reason,
    score,
    scoreClassName,
    context,
    lp,
    lpIsFinal,
}: CorrectionCoachCardProps) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const [scope, animate] = useAnimate<HTMLElement>();
    const cardAnimations = useRef<StoppableAnimation[]>([]);
    const scoreAnimations = useRef<StoppableAnimation[]>([]);
    const lpAnimations = useRef<StoppableAnimation[]>([]);
    const previousSentence = useRef(sentence);
    const previousScore = useRef(score);
    const previousLp = useRef(lp);

    useEffect(() => {
        if (previousSentence.current === sentence) return;
        previousSentence.current = sentence;
        stopAnimations(cardAnimations.current);
        if (prefersReducedMotion || !scope.current) return;

        cardAnimations.current = [
            animate(scope.current, {
                scale: [1, 1.025, 1],
                y: [0, -3, 0],
                backgroundColor: ['#e8efe3', '#cfe1c4', '#e8efe3'],
                borderColor: ['rgba(113,128,95,0.34)', 'rgba(84,126,55,0.95)', 'rgba(113,128,95,0.34)'],
                boxShadow: [
                    '0 8px 24px rgba(72,60,45,0.1)',
                    '0 0 0 6px rgba(130,166,98,0.2), 0 16px 38px rgba(73,105,48,0.28)',
                    '0 8px 24px rgba(72,60,45,0.1)',
                ],
            }, { duration: 1.25, ease: [0.22, 1, 0.36, 1] }),
            animate('[data-correction-icon]', {
                rotate: [0, -12, 10, 0],
                scale: [1, 1.28, 1],
            }, { duration: 0.52, ease: 'easeOut' }),
            animate('[data-correction-sentence]', {
                opacity: [0.25, 1],
                x: [-8, 0],
                y: [6, 0],
                color: ['#71915f', '#1f321b', '#2f3d2d'],
            }, { duration: 0.82, ease: [0.22, 1, 0.36, 1] }),
            animate('[data-correction-accent]', {
                scaleY: [0.15, 1.18, 1],
                opacity: [0.2, 1, 0.8],
            }, { duration: 0.75, ease: 'easeOut' }),
            animate('[data-correction-flash]', {
                opacity: [0, 0.85, 0],
                x: ['-110%', '115%'],
            }, { duration: 1.05, ease: 'easeInOut' }),
        ];
    }, [animate, prefersReducedMotion, scope, sentence]);

    useEffect(() => {
        if (previousScore.current === score) return;
        previousScore.current = score;
        stopAnimations(scoreAnimations.current);
        if (prefersReducedMotion || !scope.current) return;

        scoreAnimations.current = [animate('[data-correction-score]', {
            scale: [1, 1.16, 1],
        }, { duration: 0.3, ease: 'easeOut' })];
    }, [animate, prefersReducedMotion, scope, score]);

    useEffect(() => {
        if (previousLp.current === lp) return;
        previousLp.current = lp;
        stopAnimations(lpAnimations.current);
        if (prefersReducedMotion || !scope.current) return;

        lpAnimations.current = [animate('[data-correction-lp]', {
            scale: [1, 1.12, 1],
            color: ['#5f7353', '#34482f', '#5f7353'],
        }, { duration: 0.34, ease: 'easeOut' })];
    }, [animate, lp, prefersReducedMotion, scope]);

    useEffect(() => () => {
        stopAnimations(cardAnimations.current);
        stopAnimations(scoreAnimations.current);
        stopAnimations(lpAnimations.current);
    }, []);

    return (
        <section
            ref={scope}
            className="relative order-1 min-h-0 overflow-hidden rounded-xl border border-[#71805f]/35 bg-[#e8efe3] shadow-[0_8px_24px_rgba(72,60,45,0.1)]"
            aria-live="polite"
            aria-atomic="true"
        >
            <span data-correction-accent aria-hidden="true" className="absolute inset-y-0 left-0 w-1 origin-center bg-[#71805f]" />
            <span
                data-correction-flash
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 z-20 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/75 to-transparent opacity-0"
            />
            <div className="h-full overflow-hidden py-3 pl-5 pr-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-xs font-black text-[#496348]">
                            <span data-correction-icon className="inline-flex">
                                <Sparkles className="h-3.5 w-3.5" />
                            </span>
                            다음엔 이렇게 말해보세요
                        </p>
                        <p data-correction-sentence className="mt-1 line-clamp-2 break-words text-lg font-black leading-snug text-[#2f3d2d]">
                            {sentence}
                        </p>
                    </div>
                    <span
                        data-correction-score
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-black tabular-nums ${scoreClassName}`}
                    >
                        {score}
                    </span>
                </div>
                {reason && (
                    <p className="mt-1 line-clamp-2 break-words text-xs font-semibold leading-snug text-[#5f7353]">
                        {reason}
                    </p>
                )}
                {context && (
                    <p className="mt-1 break-words text-xs font-semibold leading-relaxed text-[#74675b]">{context}</p>
                )}
                <p data-correction-lp className="mt-1 origin-left text-xs font-black text-[#5f7353]">
                    {lpIsFinal ? '평가 LP' : '실시간 LP'} {lp > 0 ? '+' : ''}{lp} LP
                </p>
            </div>
        </section>
    );
}

function getReportHighlights(turns: EvaluatedTurn[], metricAverages: MetricSnapshot[]) {
    const latestTurn = turns[turns.length - 1] ?? null;
    const strongest = metricAverages.reduce(
        (best, metric) => (metric.value > best.value ? metric : best),
        metricAverages[0],
    );
    const weakest = getWeakestMetric(metricAverages);

    return {
        strongest,
        weakest,
        strength: latestTurn?.evaluation.feedback.strength
            || latestTurn?.evaluation.evidence[strongest?.key]
            || '꾸준히 영어로 답변한 점이 좋습니다.',
        improvement: latestTurn?.evaluation.feedback.improvement
            || latestTurn?.evaluation.evidence[weakest?.key]
            || '문맥에 맞는 어휘와 문장 구조를 조금 더 정확하게 다듬어 보세요.',
    };
}

export function getRepeatedErrorPatterns(turns: EvaluatedTurn[]): ReportErrorPattern[] {
    const eligibleTurns = turns.filter((turn) => turn.evaluation.confidence.toLowerCase() !== 'low');
    const patterns = new Map<string, ReportErrorPattern>();

    eligibleTurns.forEach((turn) => {
        new Set(turn.evaluation.errorTags ?? []).forEach((code) => {
            const guide = ERROR_PATTERN_GUIDES[code];
            if (!guide) return;
            const existing = patterns.get(code);
            const original = turn.evaluation.correction.original.trim() || turn.message.content.trim();
            const suggested = turn.evaluation.correction.suggested.trim();
            const hasUsefulExample = Boolean(suggested && suggested.toLowerCase() !== original.toLowerCase());

            if (existing) {
                existing.count += 1;
                if (!existing.suggested && hasUsefulExample) {
                    existing.original = original;
                    existing.suggested = suggested;
                    existing.reason = turn.evaluation.correction.reason;
                }
                return;
            }

            patterns.set(code, {
                code,
                label: guide.label,
                meaning: guide.meaning,
                advice: guide.advice,
                count: 1,
                total: eligibleTurns.length,
                original: hasUsefulExample ? original : '',
                suggested: hasUsefulExample ? suggested : '',
                reason: hasUsefulExample ? turn.evaluation.correction.reason : '',
            });
        });
    });

    return Array.from(patterns.values())
        .filter((pattern) => pattern.count >= 2)
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ko'))
        .slice(0, 2);
}

export function AssessmentPanel() {
    const isClientReady = useSyncExternalStore(
        subscribeClientReady,
        getClientReadySnapshot,
        getServerReadySnapshot,
    );
    const printRoot = isClientReady ? document.body : null;
    const messages = useStore((state) => state.messages);
    const topicSegments = useStore((state) => state.topicSegments);
    const evaluationBatchStatus = useStore((state) => state.evaluationBatchStatus);
    const activeMissions = useStore((state) => state.activeMissions);
    const addMissionCandidates = useStore((state) => state.addMissionCandidates);
    const showDeveloperLpControls = process.env.NODE_ENV !== 'production';
    const [developerLpDeltas, setDeveloperLpDeltas] = useState<number[]>([]);
    const [developerControlsOpen, setDeveloperControlsOpen] = useState(false);
    const [detailTab, setDetailTab] = useState<AssessmentDetailTab>('feedback');
    const [printReportOpen, setPrintReportOpen] = useState(false);
    const [printNoticeOpen, setPrintNoticeOpen] = useState(false);
    const prefersReducedMotion = usePrefersReducedMotion();

    const [missionSuccessSoundEnabled] = useMissionSuccessSoundEnabled();
    const missionAudioRef = useRef<MissionSuccessAudio | null>(null);
    const publishedMissionTurnIds = useRef<Set<string>>(new Set());
    const printTimeoutRef = useRef<number | null>(null);
    const printNoticeRef = useRef<HTMLButtonElement | null>(null);

    const assessment = useMemo(() => {
        const userMessages = messages.filter((message) => message.role === 'user');
        const turns: EvaluatedTurn[] = userMessages
            .filter((message): message is ChatMessage & { evaluation: TurnEvaluation } => Boolean(message.evaluation))
            .map((message) => ({ message, evaluation: message.evaluation }));
        const latestTurn = turns[turns.length - 1] ?? null;
        const sessionScore = calculateWeightedSessionScore(turns);
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
            metricAverages,
            pendingCount: userMessages.filter((message) => message.evaluationStatus === 'pending').length,
            skippedCount: userMessages.filter((message) => message.evaluationStatus === 'skipped').length,
            unavailableMessages: userMessages.filter((message) => message.evaluationStatus === 'unavailable'),
        };
    }, [messages]);

    const { userMessages, turns, latestTurn, sessionScore, metricAverages, pendingCount, skippedCount, unavailableMessages } = assessment;
    const nowEpochMs = useCountdownClock(pendingCount > 0);
    const previousTurns = turns.slice(0, -1).reverse();
    const previousEvaluatedTurn = turns[turns.length - 2] ?? null;
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
    const latestCoachMessage = latestFeedbackMessage ?? latestCorrectionMessage;
    const latestCoachSentence = latestFeedbackTurn
        ? getRetrySentence(latestFeedbackTurn)
        : latestRealtimeCorrection?.correction?.suggested
            || latestRealtimeCorrection?.content
            || latestCorrectionMessage?.correction?.suggested
            || latestCorrectionMessage?.content
            || '';
    const latestCoachReason = latestFeedbackTurn
        ? getCoachReason(latestFeedbackTurn.evaluation, latestFeedbackTurn.message.correction)
        : latestRealtimeCorrection?.correction?.reason || latestCorrectionMessage?.correction?.reason;
    const latestCoachScore = latestFeedbackTurn
        ? `${getMetricScore(latestFeedbackTurn.evaluation, 'overall')}점`
        : `${latestRealtimeCorrection?.correction?.provisionalScore
            ?? latestCorrectionMessage?.correction?.provisionalScore
            ?? '--'}점`;
    const latestCoachContext = !latestFeedbackTurn && (
        latestRealtimeCorrection?.correction?.contextReason
        || latestCorrectionMessage?.correction?.contextReason
    )
        ? `${getContextFitLabel(
            latestRealtimeCorrection?.correction?.contextFit
            || latestCorrectionMessage?.correction?.contextFit,
        )} · ${latestRealtimeCorrection?.correction?.contextReason
            || latestCorrectionMessage?.correction?.contextReason}`
        : undefined;
    const latestCoachLp = latestCoachMessage ? getCurrentMessageLp(latestCoachMessage) : 0;
    const hasMissionActivity = activeMissions.length > 0
        || userMessages.some((message) => (message.completedMissions?.length ?? 0) > 0);
    const showCoachContent = shouldShowCoachContent(turns.length, Boolean(latestCorrectionMessage))
        || hasMissionActivity;
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
    const latestMissionResults = useMemo(
        () => latestMissionMessage
            ? getMissionResultsFromCompletions(latestMissionMessage.completedMissions)
            : [],
        [latestMissionMessage],
    );
    const latestMissionBonus = latestMissionResults.reduce((sum, mission) => sum + mission.bonus, 0);
    const reportHighlights = getReportHighlights(turns, metricAverages);
    useEffect(() => {
        const audio = new MissionSuccessAudio(missionSuccessSoundEnabled);
        audio.bindInteractionUnlock();
        missionAudioRef.current = audio;
        return () => {
            audio.dispose();
            if (missionAudioRef.current === audio) missionAudioRef.current = null;
        };
    }, [missionSuccessSoundEnabled]);
    const handleMissionPresentation = useCallback((presentation: MissionCelebrationPresentation) => {
        if (presentation.cards.length === 0) return;
        void missionAudioRef.current?.play();
    }, []);
    const missionCelebration = useMissionCelebration({
        messages: userMessages,
        activeMissions,
        visibleMs: MISSION_CELEBRATION_VISIBLE_MS,
        onPresent: handleMissionPresentation,
    });
    const tierPromotion = useTierPromotionCelebration({
        tier: tier.tier,
        latestDelta: tier.latestDelta,
        totalLp: tier.totalLp,
        nextTier: tier.nextTier,
        nextTierRemainingLp: tier.nextTierRemainingLp,
    });
    useEffect(() => {
        if (!tierPromotion) return;
        void missionAudioRef.current?.playTierPromotion();
    }, [tierPromotion]);
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
        if (!showDeveloperLpControls) return;

        const toggleDeveloperControls = (event: KeyboardEvent) => {
            if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== 'l') return;
            event.preventDefault();
            setDeveloperControlsOpen((open) => !open);
        };

        window.addEventListener('keydown', toggleDeveloperControls);
        return () => window.removeEventListener('keydown', toggleDeveloperControls);
    }, [showDeveloperLpControls]);

    useEffect(() => {
        const clearPrintedDocument = () => setPrintReportOpen(false);
        window.addEventListener('afterprint', clearPrintedDocument);
        return () => window.removeEventListener('afterprint', clearPrintedDocument);
    }, []);

    useEffect(() => {
        if (!printNoticeOpen) return;
        printNoticeRef.current?.focus();
    }, [printNoticeOpen]);

    useEffect(() => () => {
        if (printTimeoutRef.current !== null) {
            window.clearTimeout(printTimeoutRef.current);
        }
    }, []);

    const handlePrintDocument = useCallback(() => {
        flushSync(() => {
            setPrintReportOpen(true);
            setPrintNoticeOpen(true);
        });
    }, []);

    const handlePrintLayoutReady = useCallback(() => {
        if (printTimeoutRef.current !== null) return;
        printTimeoutRef.current = window.setTimeout(() => {
            printTimeoutRef.current = null;
            window.print();
        }, 0);
    }, []);

    return (
        <aside className="relative isolate flex h-full min-h-0 flex-col overflow-hidden border-t border-[#483c2d]/10 bg-[#eee5dc]/95 text-[#3b3028] shadow-[-16px_0_48px_rgba(72,60,45,0.12)] backdrop-blur-xl print:border-0 print:bg-white lg:border-l lg:border-t-0">
            <MissionSuccessCelebration presentation={missionCelebration.current} />
            {printRoot && printReportOpen ? createPortal(
                <AssessmentPrintReport
                    messages={messages}
                    topicSegments={topicSegments}
                    assessableAnswerCount={turns.length}
                    sessionScore={sessionScore}
                    metrics={metricAverages}
                    tier={{ label: tier.tier.label, textColor: tier.tier.text, totalLp: tier.totalLp }}
                    cefrLevel={latestTurn?.evaluation.cefrEstimate.level ?? '--'}
                    cefrReason={latestTurn?.evaluation.cefrEstimate.reason ?? ''}
                    strength={reportHighlights.strength}
                    improvement={reportHighlights.improvement}
                    onLayoutReady={handlePrintLayoutReady}
                />,
                printRoot,
            ) : null}
            {printRoot && printNoticeOpen ? createPortal(
                <button
                    ref={printNoticeRef}
                    type="button"
                    onClick={() => setPrintNoticeOpen(false)}
                    className="fixed inset-0 z-[2147483000] flex cursor-pointer items-center justify-center bg-[#1e2824]/78 p-6 text-left backdrop-blur-sm focus:outline-none print:hidden"
                    aria-label="인쇄 안내 닫기"
                >
                    <span className="flex w-full max-w-md flex-col items-center rounded-[28px] border border-white/20 bg-[#fffaf5] px-8 py-10 text-center shadow-[0_28px_90px_rgba(18,28,24,0.4)]">
                        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#5f7353] text-white shadow-lg motion-safe:animate-pulse">
                            <Printer className="h-10 w-10" strokeWidth={2.2} />
                        </span>
                        <span className="mt-6 text-[28px] font-black tracking-tight text-[#2f3d36]">인쇄 중입니다</span>
                        <span className="mt-3 text-[17px] font-bold leading-relaxed text-[#53645c]">
                            출력물을 확인하려면<br />프린터로 이동해 주세요.
                        </span>
                        <span className="mt-7 rounded-full bg-[#edf1e8] px-5 py-2.5 text-[13px] font-black text-[#5f7353]">
                            화면을 터치하면 닫힙니다
                        </span>
                    </span>
                </button>,
                printRoot,
            ) : null}

            <div className="relative z-10 flex items-center justify-between border-b border-[#483c2d]/10 bg-white/15 px-5 py-3.5 print:hidden">
                <div className="flex items-center gap-3">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#483c2d]/10 bg-[#fffaf5] text-[#5f7353]">
                        <Activity className="h-4 w-4" />
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#eee5dc] bg-[#71805f]" />
                    </div>
                    <h2 className="text-[15px] font-black tracking-tight text-[#3b3028]">영어 코치</h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {/* 개발자용 LP 조정 버튼은 사용자 화면에서 노출하지 않습니다.
                    {showDeveloperLpControls && (
                        <button
                            type="button"
                            onClick={() => setDeveloperControlsOpen((open) => !open)}
                            className={`rounded-lg p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-[#71805f]/25 ${developerControlsOpen ? 'bg-[#edf1e8] text-[#5f7353]' : 'text-[#7a695b] hover:bg-white/45 hover:text-[#3b3028]'}`}
                            title={`${developerControlsOpen ? '개발 LP 도구 숨기기' : '개발 LP 도구 열기'} (Ctrl+Shift+L)`}
                            aria-label={developerControlsOpen ? '개발 LP 도구 숨기기' : '개발 LP 도구 열기'}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                        </button>
                    )} */}
                    <button
                        type="button"
                        onClick={handlePrintDocument}
                        disabled={turns.length === 0}
                        className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#3b3028] px-3.5 py-2.5 text-white shadow-[0_5px_14px_rgba(59,48,40,0.18)] transition-all hover:-translate-y-0.5 hover:bg-[#2d251f] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#8b6741]/35 disabled:cursor-not-allowed disabled:bg-[#d5cbc2] disabled:text-[#796c62] disabled:shadow-none disabled:hover:translate-y-0"
                        title={turns.length === 0 ? '출력할 평가가 없습니다' : '평가 리포트 출력'}
                        aria-label="평가 리포트 출력"
                    >
                        <Printer className="h-5 w-5 shrink-0" strokeWidth={2.3} />
                        <span className="whitespace-nowrap text-[13px] font-black">결과지 인쇄</span>
                    </button>
                </div>
            </div>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden p-4 print:hidden xl:p-5">
                <StatusLine
                    pendingCount={pendingCount}
                    skippedCount={skippedCount}
                    unavailableMessages={unavailableMessages}
                    evaluationBatchStatus={evaluationBatchStatus}
                    nowEpochMs={nowEpochMs}
                />

                {!showCoachContent ? (
                    <motion.section
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#483c2d]/15 bg-white/35 p-6 text-center"
                    >
                        <div className="max-w-sm">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-[#71805f]/20 bg-[#edf1e8] text-[#5f7353]">
                                <Activity className="h-6 w-6" />
                            </div>
                            <h3 className="mt-4 text-base font-black text-[#3b3028]">대화를 시작해보세요</h3>
                            <p className="mt-2 text-sm leading-relaxed text-[#7a695b]">말하는 흐름은 그대로 유지하고, 점수·교정·다음 미션은 이곳에 실시간으로 쌓입니다.</p>
                        </div>
                    </motion.section>
                ) : (
                    <div className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-2 lg:grid-rows-[minmax(176px,2.1fr)_minmax(200px,2.4fr)_minmax(0,5.5fr)] lg:overflow-hidden">
                        <div className="contents">
                            <motion.section
                                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, ease: 'easeOut' }}
                                className="relative order-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#483c2d]/10 bg-[#fffaf5]/90 shadow-[0_8px_24px_rgba(72,60,45,0.08)]"
                            >
                                <TierPromotionCelebration presentation={tierPromotion} />
                                <div className="relative flex-1 p-2.5">
                                    <div className="absolute right-0 top-0 h-20 w-20 border-b border-l border-[#483c2d]/[0.04]" />
                                    <div className="relative z-10 mb-1.5 flex min-w-0 items-center gap-2" aria-live="polite">
                                        <p className="shrink-0 text-[11px] font-black text-[#5f7353]">
                                            자동 코칭 티어
                                        </p>
                                        <p className="min-w-0 flex-1 truncate text-right text-[11px] font-bold text-[#7a695b]" title={getTierSummary(tier.tier.id)}>
                                            {getTierSummary(tier.tier.id)}
                                        </p>
                                        <div
                                            className={`inline-flex min-w-14 shrink-0 items-center justify-center rounded px-2 py-1 font-mono text-xs font-black tabular-nums ${tier.latestDelta > 0
                                            ? 'bg-[#e5f7df] text-[#16733a]'
                                            : tier.latestDelta < 0
                                                ? 'bg-[#f7e8e3] text-[#b33b28]'
                                                : 'bg-[#eee5dc] text-[#6b5a4a]'}`}
                                            aria-label={tier.latestDelta > 0
                                                ? `${tier.latestDelta} LP 획득`
                                                : tier.latestDelta < 0
                                                    ? `${Math.abs(tier.latestDelta)} LP 감소`
                                                    : 'LP 변동 없음'}
                                            title="최근 응답의 티어 LP 변동"
                                        >
                                            {tier.latestDelta > 0
                                                ? `+${tier.latestDelta} LP`
                                                : tier.latestDelta < 0
                                                    ? `${tier.latestDelta} LP`
                                                    : '— LP'}
                                        </div>
                                    </div>
                                    <div className="relative flex items-center gap-3">
                                        <TierBadge tier={tier.tier} size={58} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-end gap-2">
                                                <span className="min-w-0 truncate text-2xl font-black leading-none text-[#3b3028]">
                                                    {tier.tier.label}
                                                </span>
                                                <span className="text-xs font-bold text-[#7a695b]">{tier.lp} LP</span>
                                            </div>
                                            <TierProgressBar
                                                value={tier.progress}
                                                highlight={tier.latestDelta > 0}
                                                missionBonus={missionCelebration.current?.totalLp ?? 0}
                                                latestDelta={tier.latestDelta}
                                                pulseKey={`${tier.totalLp}-${userMessages.length}`}
                                            />
                                            <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] font-black text-[#5b4939]">
                                                <span>총 {tier.totalLp} LP</span>
                                                <span>{tier.nextTier ? `${tier.nextTier.label}까지 ${tier.nextTierRemainingLp} LP` : '최고 티어'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="min-h-[52px] shrink-0 border-t border-[#483c2d]/10 bg-[#f8f1ea] px-2 pb-2 pt-1.5">
                                    <div className="grid grid-cols-7 gap-1">
                                        {TIERS.map((item) => (
                                            <MiniTierBadge key={item.id} tier={item} />
                                        ))}
                                    </div>
                                </div>
                            </motion.section>

                            {showDeveloperLpControls && developerControlsOpen && (
                                <section className="absolute inset-x-4 top-16 z-40 rounded-lg border border-dashed border-[#9a4b36]/45 bg-[#fff7ed] p-4 shadow-xl xl:inset-x-5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="flex items-center gap-2 text-sm font-black text-[#7a3b28]">
                                                Dev LP Controls
                                                <span className="rounded bg-[#f8e5d7] px-1.5 py-0.5 text-[10px]">Ctrl+Shift+L</span>
                                            </h3>
                                            <p className="mt-1 text-xs font-semibold text-[#8a5a42]">
                                                Test-only LP events. They reset on reload and are not saved to evaluation data.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right text-xs font-black text-[#7a3b28]">
                                                <p>조정 {developerLpTotal > 0 ? '+' : ''}{developerLpTotal} LP</p>
                                                <p className="mt-1 text-[#8a5a42]">이벤트 {developerLpDeltas.length}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setDeveloperControlsOpen(false)}
                                                className="rounded p-1.5 text-[#7a3b28] transition-colors hover:bg-[#f8e5d7] focus:outline-none focus:ring-2 focus:ring-[#9a4b36]/25"
                                                title="개발 LP 도구 숨기기"
                                                aria-label="개발 LP 도구 숨기기"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
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

                            <section className="hidden rounded-lg border border-white/50 bg-white/70 p-4 shadow-sm">
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

                            <section className="hidden rounded-lg border border-white/50 bg-white/70 p-4 shadow-sm">
                                <h3 className="mb-3 text-sm font-bold text-[#483c2d]">영역별 평균</h3>
                                <div className="space-y-3">
                                    {metricAverages.map((metric) => (
                                        <MetricBar
                                            key={`${metric.key}-${latestTurn?.evaluation.turnId ?? 'empty'}`}
                                            label={metric.label}
                                            value={metric.value}
                                            highlight={Boolean(latestTurn && previousEvaluatedTurn
                                                && getMetricScore(latestTurn.evaluation, metric.key) > getMetricScore(previousEvaluatedTurn.evaluation, metric.key))}
                                        />
                                    ))}
                                </div>
                            </section>
                        </div>

                        <div className="contents">
                            <div className="order-3 min-h-0 lg:col-span-2">
                                <ActiveMissionsPanel
                                    missions={activeMissions}
                                    completedMissionIds={missionCelebration.completedMissionIds}
                                    holdReplacements={missionCelebration.isTransitionPending}
                                />
                            </div>

                            {(latestFeedbackTurn || latestRealtimeCorrection || latestCorrectionMessage) && (
                                <>
                                    <CorrectionCoachCard
                                        sentence={latestCoachSentence}
                                        reason={latestCoachReason}
                                        score={latestCoachScore}
                                        scoreClassName={latestFeedbackTurn
                                            ? getScoreAccent(getMetricScore(latestFeedbackTurn.evaluation, 'overall'))
                                            : 'bg-[#eef8f6] text-[#1f4f4a]'}
                                        context={latestCoachContext}
                                        lp={latestCoachLp}
                                        lpIsFinal={Boolean(latestCoachMessage?.evaluation)}
                                    />

                                    {latestFeedbackTurn && (
                                    <div className="hidden p-4">
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
                                </>
                            )}

                            <motion.section
                                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.08, duration: 0.35, ease: 'easeOut' }}
                                className="order-4 flex min-h-0 flex-col rounded-xl border border-[#483c2d]/10 bg-[#fffaf5]/90 p-3 shadow-[0_8px_24px_rgba(72,60,45,0.08)] lg:col-span-2"
                            >
                                <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
                                    <div
                                        className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-lg border border-[#483c2d]/10 bg-[#eee5dc] p-1"
                                        role="tablist"
                                        aria-label="평가 상세 보기"
                                    >
                                        {([
                                            ['feedback', '이전 피드백'],
                                            ['evaluation', '평가'],
                                        ] as const).map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setDetailTab(value)}
                                                role="tab"
                                                aria-selected={detailTab === value}
                                                className={`relative isolate flex min-h-8 items-center justify-center rounded-md px-3 text-xs font-black leading-none transition-[background-color,color,box-shadow,transform] duration-200 focus:outline-none focus:ring-2 focus:ring-[#71805f]/25 ${detailTab === value
                                                    ? 'bg-[#6f7f5d] text-white shadow-[0_2px_7px_rgba(75,91,58,0.24),inset_0_1px_0_rgba(255,255,255,0.2)]'
                                                    : 'text-[#7a695b] hover:bg-white/45 hover:text-[#3b3028]'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <span className="shrink-0 font-mono text-xs font-semibold text-[#8a796b]">
                                        {detailTab === 'feedback' ? `Total ${previousTurns.length}` : `Turns ${turns.length}`}
                                    </span>
                                </div>

                                <div className="relative min-h-0 flex-1 overflow-hidden">
                                    <AnimatePresence mode="wait" initial={false}>
                                        {detailTab === 'feedback' ? (
                                            <motion.div
                                                key="feedback-tab-panel"
                                                className="absolute inset-0 min-h-0"
                                                initial={prefersReducedMotion ? false : { opacity: 0, x: -16, filter: 'blur(2px)' }}
                                                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                                                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -12, filter: 'blur(2px)' }}
                                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                            >
                                                {previousTurns.length === 0 ? (
                                                    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#483c2d]/12 text-center">
                                                        <p className="max-w-xs text-xs leading-relaxed text-[#8a796b]">응답이 쌓이면 이곳에서 이전 피드백을 다시 볼 수 있습니다.</p>
                                                    </div>
                                                ) : (
                                                    <div className="h-full min-h-0 overflow-y-auto pr-1">
                                                        <div className="grid gap-2 2xl:grid-cols-2">
                                                            {previousTurns.map((turn, index) => (
                                                                <FeedbackCard key={`${turn.evaluation.turnId}-${index}`} turn={turn} compact={index > 5} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="evaluation-tab-panel"
                                                className="absolute inset-0 min-h-0"
                                                initial={prefersReducedMotion ? false : { opacity: 0, x: 16, filter: 'blur(2px)' }}
                                                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                                                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 12, filter: 'blur(2px)' }}
                                                transition={{ duration: 0.2, ease: 'easeOut' }}
                                            >
                                                <div className="h-full min-h-0 overflow-y-auto pr-1">
                                                    <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(320px,1.2fr)]">
                                                        <div className="rounded-lg border border-[#483c2d]/10 bg-[#f8f1ea] p-3">
                                                            <div className="grid grid-cols-3 gap-2">
                                                                <div className="rounded-lg border border-[#483c2d]/10 bg-[#fffaf5] px-3 py-2">
                                                                    <p className="text-[10px] font-bold text-[#8a796b]">누적 응답</p>
                                                                    <p className="mt-1 font-mono text-xl font-black leading-none text-[#3b3028]">{turns.length}</p>
                                                                </div>
                                                                <div className="rounded-lg border border-[#71805f]/15 bg-[#edf1e8] px-3 py-2">
                                                                    <p className="text-[10px] font-bold text-[#71805f]">최근 점수</p>
                                                                    <p className="mt-1 font-mono text-xl font-black leading-none text-[#496348]">
                                                                        {latestTurn ? getMetricScore(latestTurn.evaluation, 'overall') : '--'}
                                                                    </p>
                                                                </div>
                                                                <div className="rounded-lg border border-[#c59b55]/15 bg-[#fff6e5] px-3 py-2">
                                                                    <p className="text-[10px] font-bold text-[#9a7a44]">우선 연습</p>
                                                                    <p className="mt-1 truncate text-sm font-black text-[#6b4f20]" title={weakestMetric?.label}>
                                                                        {weakestMetric?.label ?? '--'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <p className="mt-3 text-xs leading-relaxed text-[#7a695b]">
                                                                평가는 교정 문장이나 미션 상태와 분리되어 누적 점수 기준으로 표시됩니다.
                                                            </p>
                                                        </div>

                                                        <div className="rounded-lg border border-[#483c2d]/10 bg-[#fffaf5] p-3">
                                                            <div className="mb-3 flex items-center justify-between">
                                                                <h3 className="text-sm font-black text-[#3b3028]">영역별 평균</h3>
                                                            </div>
                                                            <div className="space-y-3">
                                                                {metricAverages.map((metric) => (
                                                                    <MetricBar
                                                                        key={`${metric.key}-${latestTurn?.evaluation.turnId ?? 'empty'}`}
                                                                        label={metric.label}
                                                                        value={metric.value}
                                                                        highlight={Boolean(latestTurn && previousEvaluatedTurn
                                                                            && getMetricScore(latestTurn.evaluation, metric.key) > getMetricScore(previousEvaluatedTurn.evaluation, metric.key))}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.section>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
