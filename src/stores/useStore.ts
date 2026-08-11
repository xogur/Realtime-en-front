
import { create } from 'zustand';
import type {
    LipSyncDebugSnapshot,
    LipSyncMode,
    ScheduledTtsSegment,
    Emotion,
} from '@/lib/lipsync/types';
import {
    countMissionSentences,
    countWords,
    speechEvidenceMatchesText,
} from '@/lib/missionText';
import type { SpeechEvidenceV1 } from '@/lib/stt';
import type { TopicId, TopicSegment } from '@/lib/conversationTopics';

export type TurnEvaluation = {
    rubricVersion: string;
    turnId: string;
    provider: string;
    model: string;
    createdAt: string;
    scores: {
        grammar: number;
        vocabulary: number;
        relevance: number;
        fluency: number;
        interaction: number;
        overall: number;
    };
    evidence: {
        grammar: string;
        vocabulary: string;
        relevance: string;
        fluency: string;
        interaction: string;
        overall: string;
    };
    feedback: {
        summary: string;
        strength: string;
        improvement: string;
        nextPractice: string;
    };
    cefrEstimate: {
        level: string;
        reason: string;
    };
    correction: {
        original: string;
        suggested: string;
        reason: string;
        problem?: string;
        usageGuide?: string;
        category?: 'grammar' | 'vocabulary' | 'naturalness' | 'meaning_clarity' | 'comprehension';
        contextFit?: 'appropriate' | 'partial' | 'off_topic' | 'unknown';
        contextReason?: string;
        reportEligible?: boolean;
        reportPriority?: 'high' | 'medium' | 'low' | 'none';
        meaningPreserved?: boolean;
        decision?: 'confirmed_error' | 'not_an_error' | 'optional_upgrade' | 'transcript_uncertain';
        issueCode?: string;
        errorSpan?: string;
        correctedSpan?: string;
    };
    errorTags?: string[];
    learningTier?: {
        label: string;
        description: string;
    };
    calibrationNotes?: string[];
    capabilities: {
        pronunciation: string;
    };
    confidence: string;
    confidenceReasons: string[];
    missionCandidates?: PracticeMission[];
};

export type TurnCorrection = {
    turnId: string;
    provider: string;
    model: string;
    createdAt: string;
    original: string;
    suggested: string;
    reason: string;
    contextFit?: 'appropriate' | 'partial' | 'off_topic' | 'unknown';
    contextReason?: string;
    languageScore?: number;
    contextScore?: number | null;
    provisionalScore?: number;
    provisionalLp?: number;
    latencyMs?: number;
};

export type MissionKind =
    | 'grammar'
    | 'tense'
    | 'connector'
    | 'question'
    | 'length'
    | 'vocabulary'
    | 'interaction';

export type MissionCheck = {
    type:
        | 'minWords'
        | 'includesAny'
        | 'sentenceCount'
        | 'question'
        | 'pastTense'
        | 'futureTense'
        | 'presentPerfect'
        | 'connector'
        | 'politeRequest';
    value?: string | readonly string[];
    min?: number;
};

export type PracticeMission = {
    id: string;
    kind: MissionKind;
    title: string;
    target: string;
    successHint: string;
    usageContext?: string;
    exampleSentence?: string;
    rewardLp: number;
    checks: MissionCheck[];
    matchMode?: 'all' | 'any';
    createdAt: string;
    sourceTurnId?: string;
    activatedAfterMessageKey?: string;
    presentationPending?: boolean;
};

export type MissionCompletion = {
    missionId: string;
    title: string;
    target: string;
    rewardLp: number;
    reason: string;
};

type MissionReplayTurnState = Pick<ChatMessage, 'pendingMissionCompletions' | 'completedMissions'>;
type MissionReplaySnapshot = Record<string, MissionReplayTurnState>;

export type ChatMessage = {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    speechEvidence?: SpeechEvidenceV1;
    suggestions?: string[];
    correction?: TurnCorrection;
    correctionStatus?: 'pending' | 'ready' | 'skipped' | 'unavailable';
    correctionErrorCode?: string;
    correctionSkipReason?: string;
    evaluation?: TurnEvaluation;
    evaluationStatus?: 'pending' | 'ready' | 'skipped' | 'unavailable';
    evaluationErrorCode?: string;
    evaluationSkipReason?: string;
    pendingMissionCompletions?: MissionCompletion[];
    completedMissions?: MissionCompletion[];
    attemptedMission?: PracticeMission;
    learningSessionId?: string;
    segmentId?: string;
    topicId?: TopicId;
    createdAt?: string;
    isOpening?: boolean;
};

export type ChatMessageMetadata = Pick<
    ChatMessage,
    'learningSessionId' | 'segmentId' | 'topicId' | 'createdAt' | 'isOpening'
>;

export type EvaluationBatchStatus = {
    pendingCount: number;
    inFlightCount?: number;
    phase?: 'queued' | 'evaluating' | 'idle';
    revision?: number;
    sessionEpoch?: number;
    optimistic?: boolean;
    maxTurns: number;
    delaySeconds: number;
    nextFlushAtEpochMs?: number | null;
    sourceNextFlushAtEpochMs?: number | null;
    serverEpochMs?: number | null;
    receivedAtEpochMs: number;
};

interface AppState {
    isConnecting: boolean;
    isConnected: boolean;
    isSttReady: boolean;
    isRecording: boolean;
    isPlaying: boolean;
    volume: number; // 0 to 1, for visualizer
    messages: ChatMessage[];
    learningSessionId: string | null;
    topicSegments: TopicSegment[];
    activeSegmentId: string | null;
    conversationStartStatus: 'idle' | 'preparing' | 'opening' | 'error';
    conversationStartError: string | null;
    evaluationBatchStatus: EvaluationBatchStatus | null;
    activeMissions: PracticeMission[];
    missionQueue: PracticeMission[];
    missionReplaySnapshot: MissionReplaySnapshot | null;
    sessionReplayMessageKeys: string[];
    isSessionReplay: boolean;
    partialMessage: string;
    setPartialMessage: (message: string) => void;
    liveTranscript: string;
    setLiveTranscript: (transcript: string) => void;
    isChatOpen: boolean;
    toggleChat: () => void;

    audioAnalyser: AnalyserNode | null;
    setAudioAnalyser: (analyser: AnalyserNode | null) => void;

    emotion: Emotion;
    setEmotion: (emotion: Emotion) => void;

    isThinking: boolean;
    setThinking: (isThinking: boolean) => void;

    lipSyncMode: LipSyncMode;
    setLipSyncMode: (mode: LipSyncMode) => void;
    ttsSegments: Record<string, ScheduledTtsSegment>;
    upsertTtsSegment: (segment: ScheduledTtsSegment) => void;
    patchTtsSegment: (segmentId: string, patch: Partial<ScheduledTtsSegment>) => void;
    removeTtsSegment: (segmentId: string) => void;
    clearTtsSegments: (responseId?: string) => void;
    lipSyncDebugEnabled: boolean;
    setLipSyncDebugEnabled: (enabled: boolean) => void;
    currentLipSyncSnapshot: LipSyncDebugSnapshot | null;
    setCurrentLipSyncSnapshot: (snapshot: LipSyncDebugSnapshot | null) => void;

    // Avatar Selection
    currentAvatarId: string;
    setCurrentAvatar: (id: string) => void;

    // ... existing ...
    voice: string;
    speed: number;
    textScale: number;
    showKoreanInterpretation: boolean;
    showReplySuggestions: boolean;
    avatarName: 'model' | 'avatar';

    setConnecting: (status: boolean) => void;
    setConnected: (status: boolean) => void;
    setSttReady: (status: boolean) => void;
    setRecording: (status: boolean) => void;
    setPlaying: (status: boolean) => void;
    setVolume: (volume: number) => void;
    addMessage: (
        role: 'user' | 'assistant',
        content: string,
        id?: string,
        speechEvidence?: SpeechEvidenceV1,
        metadata?: ChatMessageMetadata,
    ) => void;
    syncMessages: (messages: ChatMessage[]) => void;
    appendToLastAssistantMessage: (content: string) => void;
    appendToAssistantMessage: (turnId: string, content: string) => void;
    setLastAssistantSuggestions: (suggestions: string[]) => void;
    setAssistantSuggestions: (turnId: string, suggestions: string[]) => void;
    setActiveMissions: (missions: PracticeMission[]) => void;
    markMissionsPresented: (missionIds: readonly string[]) => void;
    addMissionCandidates: (missions: PracticeMission[]) => void;
    assignLatestPendingUserTurnId: (turnId: string) => void;
    setTurnEvaluation: (turnId: string, evaluation: TurnEvaluation) => void;
    setTurnCorrection: (turnId: string, correction: TurnCorrection) => void;
    setTurnCorrectionSkipped: (turnId: string, reason?: string) => void;
    setTurnCorrectionUnavailable: (turnId: string, code?: string) => void;
    setTurnEvaluationSkipped: (turnId: string, reason?: string) => void;
    setTurnEvaluationUnavailable: (turnId: string, code?: string) => void;
    getPendingEvaluationTurnIds: () => string[];
    skipPendingTurnEvaluations: (reason?: string) => void;
    setEvaluationBatchStatus: (status: Omit<EvaluationBatchStatus, 'receivedAtEpochMs' | 'sourceNextFlushAtEpochMs'>) => void;
    queueLocalEvaluationBatchTurn: (delaySeconds: number, maxTurns: number, sessionEpoch?: number) => void;
    clearEvaluationBatchStatus: () => void;
    setVoice: (voice: string) => void;
    setSpeed: (speed: number) => void;
    setTextScale: (scale: number) => void;
    toggleKoreanInterpretation: () => void;
    setShowReplySuggestions: (visible: boolean) => void;
    toggleReplySuggestions: () => void;
    setAvatarName: (name: 'model' | 'avatar') => void;

    socket: WebSocket | null;
    setSocket: (socket: WebSocket | null) => void;

    clearMessages: () => void;
    setConversationState: (
        learningSessionId: string,
        segments: TopicSegment[],
        activeSegmentId: string | null,
    ) => void;
    upsertTopicSegment: (segment: TopicSegment, learningSessionId?: string) => void;
    setConversationStartStatus: (
        status: AppState['conversationStartStatus'],
        error?: string | null,
    ) => void;
    beginSessionReplay: () => void;
    reconcileSessionReplayPendingEvaluations: (replayedMessageKeys?: readonly string[]) => void;
    finishSessionReplay: () => void;
}

// Avatar-to-Voice Mapping Table
// 프론트엔드 UI ID (avatarConstants.ts) -> 백엔드 Qwen3 화자 이름 (서버 Supported 목록과 정확히 일치)
export const AVATAR_VOICE_MAP: Record<string, string> = {
    'Sohee': 'sohee',
    'Vivian': 'vivian',
    'Ryan': 'ryan',
    'Aiden': 'aiden',
    'Uncle_Fu': 'uncle_fu',
    'Dylan': 'dylan',
    'Serena': 'serena',
    'Eric': 'eric',
    'Ono_Anna': 'ono_anna',
    'model': 'ryan',
    'avatar': 'ryan',
};

export const DEFAULT_AVATAR_ID = 'Ryan';
export const DEFAULT_VOICE_ID = AVATAR_VOICE_MAP[DEFAULT_AVATAR_ID];
const MAX_ACTIVE_MISSIONS = 3;
const MAX_QUEUED_MISSIONS = 12;

const MISSION_STT_SEGMENT_FALLBACK_ENABLED =
    process.env.NEXT_PUBLIC_MISSION_STT_SEGMENT_FALLBACK?.trim().toLowerCase() !== 'false';

function normalizeMissionText(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function textIncludesAny(text: string, values: string[]): boolean {
    const normalized = normalizeMissionText(text);
    return values.some((value) => {
        const target = normalizeMissionText(value);
        if (!target) return false;
        return new RegExp(`(^|[^a-z])${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(normalized);
    });
}

function hasQuestionSyntax(text: string): boolean {
    const trimmed = text.trim();
    if (/[?？]\s*$/.test(trimmed)) return true;
    return /\b(what|how|why|when|where|who|which)\b[^.!?]*$/i.test(trimmed)
        || /\b(can|could|would|do|does|did|is|are)\s+(you|we|they|he|she|it|i)\b[^.!?]*$/i.test(trimmed);
}

function checkMissionRule(
    text: string,
    check: MissionCheck,
    speechEvidence?: SpeechEvidenceV1,
): boolean {
    const normalized = normalizeMissionText(text);
    const values = Array.isArray(check.value) ? check.value : check.value ? [check.value] : [];

    switch (check.type) {
        case 'minWords':
            return countWords(text) >= (check.min ?? 8);
        case 'includesAny':
            return values.length > 0 && textIncludesAny(text, values);
        case 'sentenceCount':
            return countMissionSentences(
                text,
                speechEvidence,
                MISSION_STT_SEGMENT_FALLBACK_ENABLED,
            ).count >= (check.min ?? 2);
        case 'question':
            return hasQuestionSyntax(text);
        case 'pastTense':
            return /\b(was|were|did|had|went|saw|made|played|visited|watched|studied|worked|learned|liked|wanted|needed|tried|used)\b/i.test(text)
                || /\b[a-z]+ed\b/i.test(text);
        case 'futureTense':
            return /\b(will|going to|plan to|want to|would like to)\b/i.test(text);
        case 'presentPerfect':
            return /\b(has|have)\s+(been|done|made|seen|visited|learned|studied|worked|played|tried|used|[a-z]+ed)\b/i.test(text);
        case 'connector':
            return /\b(because|so|but|although|for example|for instance)\b/i.test(text);
        case 'politeRequest':
            return /\b(can|could|would)\s+you\b/i.test(text) || /\bplease\b/i.test(text);
        default:
            return normalized.length > 0;
    }
}

function missionMatchesText(
    text: string,
    mission: PracticeMission,
    speechEvidence?: SpeechEvidenceV1,
): boolean {
    if (mission.checks.length === 0) return false;
    const results = mission.checks.map((check) => checkMissionRule(text, check, speechEvidence));
    return mission.matchMode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function completeMissions(
    text: string,
    missions: PracticeMission[],
    speechEvidence?: SpeechEvidenceV1,
): MissionCompletion[] {
    return missions
        .filter((mission) => missionMatchesText(text, mission, speechEvidence))
        .map((mission) => ({
            missionId: mission.id,
            title: mission.title,
            target: mission.target,
            rewardLp: mission.rewardLp,
            reason: mission.successHint,
        }));
}

function mergeUniqueCompletions(...groups: Array<MissionCompletion[] | undefined>): MissionCompletion[] {
    const seen = new Set<string>();
    return groups.flatMap((group) => group ?? []).filter((completion) => {
        if (seen.has(completion.missionId)) return false;
        seen.add(completion.missionId);
        return true;
    });
}

function getMissionKey(mission: PracticeMission): string {
    const checks = normalizeMissionChecks(mission).map((check) => ({
        type: check.type,
        min: check.min,
        value: typeof check.value === 'string'
            ? normalizeMissionText(check.value)
            : check.value
                ? [...check.value].map(normalizeMissionText).sort()
                : undefined,
    }));
    return `${mission.kind}:${JSON.stringify(checks)}`;
}

function getUserMessageKey(message: Pick<ChatMessage, 'id' | 'content'>): string {
    return message.id ? `id:${message.id}` : `text:${normalizeMissionText(message.content)}`;
}

function getLatestUserMessageKey(messages: ChatMessage[]): string | undefined {
    const latestUserMessage = messages.findLast((message) => message.role === 'user');
    return latestUserMessage ? getUserMessageKey(latestUserMessage) : undefined;
}

function refillActiveMissions(
    activeMissions: PracticeMission[],
    missionQueue: PracticeMission[],
    activatedAfterMessageKey?: string,
    deferPresentation = false,
) {
    const availableSlots = MAX_ACTIVE_MISSIONS - activeMissions.length;
    if (availableSlots <= 0) {
        return {
            activeMissions: activeMissions.slice(0, MAX_ACTIVE_MISSIONS),
            missionQueue: missionQueue.slice(0, MAX_QUEUED_MISSIONS),
        };
    }

    return {
        activeMissions: [
            ...activeMissions,
            ...missionQueue.slice(0, availableSlots).map((mission) => ({
                ...mission,
                activatedAfterMessageKey: activatedAfterMessageKey ?? mission.activatedAfterMessageKey,
                presentationPending: deferPresentation ? true : undefined,
            })),
        ].slice(0, MAX_ACTIVE_MISSIONS),
        missionQueue: missionQueue.slice(availableSlots, availableSlots + MAX_QUEUED_MISSIONS),
    };
}

function getApplicableMissionsForMessage(messages: ChatMessage[], messageIndex: number, missions: PracticeMission[]): PracticeMission[] {
    return missions.filter((mission) => {
        if (mission.presentationPending) return false;
        if (mission.activatedAfterMessageKey) {
            const activationIndex = messages.findIndex((candidate) => (
                candidate.role === 'user' && getUserMessageKey(candidate) === mission.activatedAfterMessageKey
            ));
            if (activationIndex >= 0 && messageIndex <= activationIndex) return false;
        }

        if (!mission.sourceTurnId) return true;
        const sourceIndex = messages.findIndex((candidate) => candidate.role === 'user' && candidate.id === mission.sourceTurnId);
        return sourceIndex < 0 || messageIndex > sourceIndex;
    });
}

function applyImmediateMissionCompletions(
    messages: ChatMessage[],
    messageIndex: number,
    activeMissions: PracticeMission[],
    missionQueue: PracticeMission[],
    deferReplacementPresentation = true,
) {
    const message = messages[messageIndex];
    if (!message || message.role !== 'user' || activeMissions.length === 0) {
        return { messages, activeMissions, missionQueue };
    }

    const previouslyCompletedIds = new Set(
        messages.flatMap((candidate) => candidate.completedMissions ?? []).map((mission) => mission.missionId),
    );
    const completions = completeMissions(
        message.content,
        getApplicableMissionsForMessage(messages, messageIndex, activeMissions),
        message.speechEvidence,
    ).filter((completion) => !previouslyCompletedIds.has(completion.missionId));
    if (completions.length === 0) {
        return { messages, activeMissions, missionQueue };
    }

    const completedIds = new Set(completions.map((completion) => completion.missionId));
    const missions = refillActiveMissions(
        activeMissions.filter((mission) => !completedIds.has(mission.id)),
        missionQueue,
        getUserMessageKey(message),
        deferReplacementPresentation,
    );
    const nextMessages = [...messages];
    nextMessages[messageIndex] = {
        ...message,
        pendingMissionCompletions: undefined,
        completedMissions: mergeUniqueCompletions(message.completedMissions, completions),
    };
    return {
        messages: nextMessages,
        activeMissions: missions.activeMissions,
        missionQueue: missions.missionQueue,
    };
}

function findMissionSourceMessage(messages: ChatMessage[], sourceTurnId?: string): ChatMessage | undefined {
    if (!sourceTurnId) return undefined;
    return messages.find((message) => (
        message.role === 'user'
        && (message.id === sourceTurnId || message.id?.endsWith(`:${sourceTurnId}`))
    ));
}

function pickResultStatus(
    local?: ChatMessage['correctionStatus'] | ChatMessage['evaluationStatus'],
    incoming?: ChatMessage['correctionStatus'] | ChatMessage['evaluationStatus'],
) {
    const rank = { pending: 0, skipped: 1, unavailable: 1, ready: 2 } as const;
    if (!local) return incoming;
    if (!incoming) return local;
    return rank[incoming] > rank[local] ? incoming : local;
}

function mergeMessageState(local: ChatMessage, incoming: ChatMessage): ChatMessage {
    const correction = local.correction ?? incoming.correction;
    const evaluation = local.evaluation ?? incoming.evaluation;
    const completedMissions = mergeUniqueCompletions(local.completedMissions, incoming.completedMissions);
    const pendingMissionCompletions = mergeUniqueCompletions(
        local.pendingMissionCompletions,
        incoming.pendingMissionCompletions,
    );
    const suggestions = Array.from(new Set([...(local.suggestions ?? []), ...(incoming.suggestions ?? [])]));
    const incomingHasMatchingEvidence = Boolean(
        incoming.speechEvidence
        && speechEvidenceMatchesText(incoming.content, incoming.speechEvidence),
    );
    const localHasMatchingEvidence = Boolean(
        local.speechEvidence
        && speechEvidenceMatchesText(local.content, local.speechEvidence),
    );
    const mergedContent = incomingHasMatchingEvidence
        ? incoming.content
        : localHasMatchingEvidence
            ? local.content
            : incoming.content.length > local.content.length
                ? incoming.content
                : local.content;
    const mergedSpeechEvidence = incomingHasMatchingEvidence
        ? incoming.speechEvidence
        : localHasMatchingEvidence
            ? local.speechEvidence
            : undefined;

    return {
        ...incoming,
        ...local,
        id: local.id ?? incoming.id,
        content: mergedContent,
        speechEvidence: mergedSpeechEvidence,
        correction,
        evaluation,
        correctionStatus: correction ? 'ready' : pickResultStatus(local.correctionStatus, incoming.correctionStatus),
        evaluationStatus: evaluation ? 'ready' : pickResultStatus(local.evaluationStatus, incoming.evaluationStatus),
        correctionErrorCode: correction ? undefined : local.correctionErrorCode ?? incoming.correctionErrorCode,
        correctionSkipReason: correction ? undefined : local.correctionSkipReason ?? incoming.correctionSkipReason,
        evaluationErrorCode: evaluation ? undefined : local.evaluationErrorCode ?? incoming.evaluationErrorCode,
        evaluationSkipReason: evaluation ? undefined : local.evaluationSkipReason ?? incoming.evaluationSkipReason,
        completedMissions: completedMissions.length > 0 ? completedMissions : undefined,
        pendingMissionCompletions: pendingMissionCompletions.length > 0 ? pendingMissionCompletions : undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
}

function mergeSyncedMessages(localMessages: ChatMessage[], incomingMessages: ChatMessage[]): ChatMessage[] {
    // The viewer WebSocket owns the complete timeline. BroadcastChannel updates from the
    // main window may be late or partial, so they can enrich but never prune viewer state.
    const merged = [...localMessages];
    const fallbackMatches = new Set<number>();

    incomingMessages.forEach((incoming) => {
        let matchIndex = incoming.id
            ? merged.findIndex((local) => local.role === incoming.role && local.id === incoming.id)
            : -1;

        if (matchIndex < 0) {
            matchIndex = merged.findIndex((local, index) => (
                !fallbackMatches.has(index)
                && local.role === incoming.role
                && local.content === incoming.content
            ));
        }

        if (matchIndex >= 0) {
            fallbackMatches.add(matchIndex);
            merged[matchIndex] = mergeMessageState(merged[matchIndex], incoming);
            return;
        }

        merged.push(incoming);
    });

    return merged;
}

function getSessionReplayMessageKey(role: ChatMessage['role'], id: string | undefined, content: string): string {
    return id ? `${role}:id:${id}` : `${role}:content:${content}`;
}

function applyEvaluationToMessage(
    messages: ChatMessage[],
    messageIndex: number,
    activeMissions: PracticeMission[],
    missionQueue: PracticeMission[],
    evaluation: TurnEvaluation,
    turnId?: string,
) {
    const completed = applyImmediateMissionCompletions(
        messages,
        messageIndex,
        activeMissions,
        missionQueue,
    );
    const nextMessages = [...completed.messages];
    const message = nextMessages[messageIndex];
    nextMessages[messageIndex] = {
        ...message,
        id: turnId ?? message.id,
        evaluation,
        evaluationStatus: 'ready',
        evaluationErrorCode: undefined,
        evaluationSkipReason: undefined,
    };
    return {
        messages: nextMessages,
        activeMissions: completed.activeMissions,
        missionQueue: completed.missionQueue,
    };
}

function sanitizeMission(mission: PracticeMission): PracticeMission | null {
    if (!mission.id || !mission.target || !mission.title || !Array.isArray(mission.checks)) return null;
    const localized = localizeMission(mission);
    const guidance = getMissionGuidance(localized);
    const useRuleBasedGuidance = shouldUseRuleBasedGuidance(localized);
    return {
        ...localized,
        usageContext: (useRuleBasedGuidance ? guidance.usageContext : localized.usageContext || guidance.usageContext)?.slice(0, 160),
        exampleSentence: (useRuleBasedGuidance ? guidance.exampleSentence : localized.exampleSentence || guidance.exampleSentence)?.slice(0, 160),
        rewardLp: Math.max(3, Math.min(12, Math.round(mission.rewardLp || 5))),
        checks: normalizeMissionChecks(mission).slice(0, 3),
        matchMode: shouldForceConnectorCheck(mission) ? 'all' : mission.matchMode === 'any' ? 'any' : 'all',
    };
}

function shouldForceConnectorCheck(mission: PracticeMission): boolean {
    const text = `${mission.kind} ${mission.title} ${mission.target}`.toLowerCase();
    return mission.kind === 'connector' || /\b(because|so|but|for example|for instance|although)\b/.test(text);
}

function normalizeMissionChecks(mission: PracticeMission): MissionCheck[] {
    if (shouldForceConnectorCheck(mission)) {
        return [{ type: 'connector' }];
    }
    return mission.checks;
}

function firstMissionCheck(mission: PracticeMission): MissionCheck | undefined {
    return normalizeMissionChecks(mission)[0];
}

function missionValues(check?: MissionCheck): string[] {
    if (!check?.value) return [];
    return typeof check.value === 'string' ? [check.value] : [...check.value];
}

function formatMissionValues(values: string[]): string {
    if (values.length === 0) return '목표 표현';
    if (values.length === 1) return values[0];
    return values.join(', ');
}

type MissionGuidance = Pick<PracticeMission, 'usageContext' | 'exampleSentence'>;

const EXPRESSION_GUIDANCE: Record<string, Required<MissionGuidance>> = {
    'i think|in my opinion': {
        usageContext: '자신의 생각이나 의견임을 분명히 밝힐 때 사용합니다.',
        exampleSentence: 'In my opinion, this option is better.',
    },
    'i prefer|i would rather': {
        usageContext: '두 선택지 중 더 좋아하거나 원하는 것을 말할 때 사용합니다.',
        exampleSentence: 'I would rather stay home tonight.',
    },
    'often|sometimes|usually': {
        usageContext: '어떤 행동을 얼마나 자주 하는지 말할 때 사용합니다.',
        exampleSentence: 'I usually go for a walk after dinner.',
    },
    'finally|first|then': {
        usageContext: '여러 행동이나 생각을 순서대로 설명할 때 사용합니다.',
        exampleSentence: 'First, I stretch, then I start running.',
    },
    'also|in addition': {
        usageContext: '앞에서 말한 내용에 관련 정보를 하나 더 덧붙일 때 사용합니다.',
        exampleSentence: 'The class is useful, and it is also fun.',
    },
    'maybe|perhaps|probably': {
        usageContext: '확실하지 않은 예상이나 가능성을 조심스럽게 말할 때 사용합니다.',
        exampleSentence: 'Maybe I will visit my parents this weekend.',
    },
    'i agree|that is true': {
        usageContext: '상대의 의견에 동의한다는 뜻을 분명히 전할 때 사용합니다.',
        exampleSentence: 'I agree that exercise is important.',
    },
    'i do not agree|i see it differently': {
        usageContext: '상대와 다른 의견을 정중하게 말할 때 사용합니다.',
        exampleSentence: 'I see it differently because cost matters to me.',
    },
    'less than|more than': {
        usageContext: '수량, 시간, 정도가 어떤 기준보다 많거나 적다고 비교할 때 사용합니다.',
        exampleSentence: 'My commute takes more than thirty minutes.',
    },
    'such as': {
        usageContext: '앞에서 말한 범주에 구체적인 예를 덧붙일 때 사용합니다.',
        exampleSentence: 'I enjoy outdoor activities such as hiking and cycling.',
    },
    'however|on the other hand': {
        usageContext: '앞 내용과 대조되는 생각이나 다른 관점을 이어 말할 때 사용합니다.',
        exampleSentence: 'I like the price. However, the room is too small.',
    },
    'it depends': {
        usageContext: '상황이나 조건에 따라 답이 달라진다고 말할 때 사용합니다.',
        exampleSentence: 'It depends on the weather.',
    },
    'if': {
        usageContext: '어떤 조건에서 일이 일어나는지 더 정확하게 말할 때 사용합니다.',
        exampleSentence: 'If I have time, I will practice more.',
    },
    'used to': {
        usageContext: '지금은 아니지만 예전에 반복했던 행동이나 상태를 말할 때 사용합니다.',
        exampleSentence: 'I used to play soccer after school.',
    },
    'i mean|in other words': {
        usageContext: '방금 한 말을 더 쉽게 풀거나 정확한 뜻으로 다시 설명할 때 사용합니다.',
        exampleSentence: 'The trip was exhausting. I mean, we walked all day.',
    },
    'sounds good|that makes sense': {
        usageContext: '상대의 제안에 긍정적으로 반응하거나 설명을 이해했다고 말할 때 사용합니다.',
        exampleSentence: 'That makes sense. Thanks for explaining it.',
    },
    'actually|in fact': {
        usageContext: '예상과 다른 사실을 바로잡거나 중요한 사실을 강조할 때 사용합니다.',
        exampleSentence: 'Actually, I have already seen that movie.',
    },
};

function getExpressionGuidance(values: string[]): Required<MissionGuidance> | undefined {
    const key = values.map((value) => value.trim().toLowerCase()).filter(Boolean).sort().join('|');
    return EXPRESSION_GUIDANCE[key];
}

function shouldUseRuleBasedGuidance(mission: PracticeMission): boolean {
    const check = firstMissionCheck(mission);
    if (check?.type !== 'includesAny') return true;
    return Boolean(getExpressionGuidance(missionValues(check)));
}

function getIncludesAnyGuidance(values: string[]): MissionGuidance {
    const expressionGuidance = getExpressionGuidance(values);
    if (expressionGuidance) return expressionGuidance;

    const valueText = formatMissionValues(values);

    return {
        usageContext: `${valueText} 표현을 답변 안에 자연스럽게 넣고 싶을 때 사용합니다.`,
        exampleSentence: values.length > 0
            ? `I can use "${values[0]}" to make my answer clearer.`
            : 'I can add one useful expression to my answer.',
    };
}

function getMissionGuidance(mission: PracticeMission): Pick<PracticeMission, 'usageContext' | 'exampleSentence'> {
    const check = firstMissionCheck(mission);
    const values = missionValues(check).filter(Boolean);
    const min = check?.min;

    if (shouldForceConnectorCheck(mission)) {
        return {
            usageContext: '이유를 설명하거나 앞 문장에 예시를 덧붙이고 싶을 때 사용합니다.',
            exampleSentence: 'I like this place because it is quiet.',
        };
    }

    switch (check?.type) {
        case 'minWords':
            return {
                usageContext: '짧게 끝내지 않고 이유나 세부 정보를 한 문장 더 붙일 때 사용합니다.',
                exampleSentence: 'I usually study English after dinner because it helps me relax.',
            };
        case 'sentenceCount':
            return {
                usageContext: '한 가지 생각을 말한 뒤 이유, 예시, 느낌을 이어 말할 때 사용합니다.',
                exampleSentence: 'I like morning walks. They make me feel fresh.',
            };
        case 'question':
            return {
                usageContext: '내 답변 뒤에 상대 의견을 묻거나 대화를 이어가고 싶을 때 사용합니다.',
                exampleSentence: 'I like coffee. What about you?',
            };
        case 'pastTense':
            return {
                usageContext: '어제, 지난주, 예전에 한 일을 말할 때 사용합니다.',
                exampleSentence: 'I watched a movie yesterday.',
            };
        case 'futureTense':
            return {
                usageContext: '앞으로 할 계획이나 원하는 일을 말할 때 사용합니다.',
                exampleSentence: 'I will practice speaking tonight.',
            };
        case 'presentPerfect':
            return {
                usageContext: '지금까지 해본 경험이나 최근에 배운 것을 말할 때 사용합니다.',
                exampleSentence: 'I have tried online English lessons.',
            };
        case 'politeRequest':
            return {
                usageContext: '상대에게 도움이나 설명을 정중하게 부탁할 때 사용합니다.',
                exampleSentence: 'Could you explain that again, please?',
            };
        case 'includesAny':
            return getIncludesAnyGuidance(values);
        default:
            return {
                usageContext: '답변을 조금 더 자연스럽고 구체적으로 만들고 싶을 때 사용합니다.',
                exampleSentence: min ? `I can answer with at least ${min} English words.` : 'I think this is helpful because I can practice more.',
            };
    }
}

function localizeMission(mission: PracticeMission): PracticeMission {
    const check = firstMissionCheck(mission);
    const values = missionValues(check).filter(Boolean);
    const min = check?.min;

    if (shouldForceConnectorCheck(mission)) {
        return {
            ...mission,
            title: '이유 연결',
            target: "답변에 because, so, but, for example 중 하나를 넣어 이유나 예시를 붙여보세요.",
            successHint: '연결어를 사용해 답변이 더 자연스럽게 확장됐습니다.',
        };
    }

    switch (check?.type) {
        case 'minWords':
            return {
                ...mission,
                title: '길게 말하기',
                target: `답변을 영어 단어 ${min ?? 8}개 이상으로 말해보세요.`,
                successHint: '충분한 길이로 말하며 유창성을 연습했습니다.',
            };
        case 'sentenceCount':
            return {
                ...mission,
                title: '두 문장 말하기',
                target: `답변을 ${min ?? 2}문장 이상으로 말해보세요.`,
                successHint: '여러 문장으로 답변을 확장했습니다.',
            };
        case 'question':
            return {
                ...mission,
                title: '질문 이어가기',
                target: '답변에 질문을 하나 넣어 대화를 이어가 보세요.',
                successHint: '질문을 덧붙여 대화를 자연스럽게 이어갔습니다.',
            };
        case 'pastTense':
            return {
                ...mission,
                title: '과거시제',
                target: 'went, did, was, -ed 동사처럼 과거 표현을 하나 사용해보세요.',
                successHint: '과거 표현을 사용했습니다.',
            };
        case 'futureTense':
            return {
                ...mission,
                title: '미래 표현',
                target: 'will, going to, plan to 같은 미래 표현을 하나 사용해보세요.',
                successHint: '미래 표현을 사용했습니다.',
            };
        case 'presentPerfect':
            return {
                ...mission,
                title: '현재완료',
                target: 'have tried, have learned 같은 현재완료 표현을 하나 사용해보세요.',
                successHint: '현재완료 표현을 사용했습니다.',
            };
        case 'politeRequest':
            return {
                ...mission,
                title: '정중한 요청',
                target: 'can you, could you, would you, please 중 하나로 정중하게 요청해보세요.',
                successHint: '정중한 요청 표현을 사용했습니다.',
            };
        case 'includesAny':
            return {
                ...mission,
                title: mission.kind === 'vocabulary' ? '어휘 사용' : '표현 사용',
                target: values.length > 0
                    ? values.length === 1
                        ? `답변에 ${values[0]}를 자연스럽게 사용해보세요.`
                        : `답변에 ${values.join(', ')} 중 하나를 자연스럽게 사용해보세요.`
                    : '답변에 새 표현을 하나 사용해보세요.',
                successHint: '목표 표현을 답변에 사용했습니다.',
            };
        default:
            return {
                ...mission,
                title: mission.title || '말하기 미션',
                target: mission.target || '답변을 한 문장 더 자연스럽게 확장해보세요.',
                successHint: mission.successHint || '미션 조건을 달성했습니다.',
            };
    }
}

export const useStore = create<AppState>((set, get) => ({
    isConnecting: false,
    isConnected: false,
    isSttReady: false,
    isRecording: false,
    isPlaying: false,
    volume: 0,
    messages: [],
    learningSessionId: null,
    topicSegments: [],
    activeSegmentId: null,
    conversationStartStatus: 'idle',
    conversationStartError: null,
    evaluationBatchStatus: null,
    activeMissions: [],
    missionQueue: [],
    missionReplaySnapshot: null,
    sessionReplayMessageKeys: [],
    isSessionReplay: false,
    partialMessage: '',
    liveTranscript: '',
    isChatOpen: false, // Default closed
    voice: DEFAULT_VOICE_ID,
    speed: 0.8,
    textScale: 1.0,
    showKoreanInterpretation: true,
    showReplySuggestions: true,
    avatarName: 'avatar',
    currentAvatarId: DEFAULT_AVATAR_ID,
    lipSyncMode: 'heuristic',
    ttsSegments: {},
    lipSyncDebugEnabled: false,
    currentLipSyncSnapshot: null,

    setConnecting: (status) => set({ isConnecting: status }),
    setConnected: (status) => set({ isConnected: status }),
    setSttReady: (status) => set({ isSttReady: status }),
    setRecording: (status) => set({ isRecording: status }),
    setPlaying: (status) => set({ isPlaying: status }),
    setVolume: (volume) => set({ volume }),
    addMessage: (role, content, id, speechEvidence, metadata) =>
        set((state) => {
            const replayMessageKey = getSessionReplayMessageKey(role, id, content);
            const sessionReplayMessageKeys = state.isSessionReplay
                ? Array.from(new Set([...state.sessionReplayMessageKeys, replayMessageKey]))
                : state.sessionReplayMessageKeys;
            if (id) {
                const existingIndex = state.messages.findIndex((message) => message.role === role && message.id === id);
                if (existingIndex >= 0) {
                    const messages = [...state.messages];
                    const existingMessage = messages[existingIndex];
                    if (role === 'assistant') {
                        messages[existingIndex] = {
                            ...existingMessage,
                            content,
                            ...metadata,
                        };
                        return { messages, sessionReplayMessageKeys };
                    }

                    const candidateMessages = [...messages];
                    candidateMessages[existingIndex] = {
                        ...existingMessage,
                        content,
                        speechEvidence: speechEvidence ?? existingMessage.speechEvidence,
                        correctionStatus: existingMessage.correctionStatus ?? 'pending',
                        evaluationStatus: existingMessage.evaluationStatus ?? 'pending',
                        ...metadata,
                    };
                    return {
                        ...applyImmediateMissionCompletions(
                            candidateMessages,
                            existingIndex,
                            state.activeMissions,
                            state.missionQueue,
                        ),
                        sessionReplayMessageKeys,
                    };
                }
            }

            const replayedMissionState = role === 'user' && state.isSessionReplay
                ? state.missionReplaySnapshot?.[getUserMessageKey({ id, content })]
                : undefined;
            const messages = [
                ...state.messages,
                {
                    id,
                    role,
                    content,
                    speechEvidence,
                    ...metadata,
                    correctionStatus: role === 'user' ? 'pending' as const : undefined,
                    evaluationStatus: role === 'user' ? 'pending' as const : undefined,
                    pendingMissionCompletions: replayedMissionState?.pendingMissionCompletions,
                    completedMissions: replayedMissionState?.completedMissions,
                },
            ];
            if (role !== 'user' || state.isSessionReplay) {
                return { messages, sessionReplayMessageKeys };
            }
            return applyImmediateMissionCompletions(
                messages,
                messages.length - 1,
                state.activeMissions,
                state.missionQueue,
            );
        }),
    syncMessages: (messages) =>
        set((state) => {
            const mergedMessages = mergeSyncedMessages(state.messages, messages);
            const latestUserIndex = mergedMessages.findLastIndex((message) => message.role === 'user');
            if (latestUserIndex < 0) return { messages: mergedMessages };
            return applyImmediateMissionCompletions(
                mergedMessages,
                latestUserIndex,
                state.activeMissions,
                state.missionQueue,
            );
        }),
    appendToLastAssistantMessage: (content) =>
        set((state) => {
            const messages = [...state.messages];
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (messages[index].role === 'assistant') {
                    messages[index] = {
                        ...messages[index],
                        content: `${messages[index].content}\n\n${content}`,
                    };
                    return { messages };
                }
            }
            return state;
        }),
    appendToAssistantMessage: (turnId, content) =>
        set((state) => {
            const messages = [...state.messages];
            const index = messages.findLastIndex(
                (message) => message.role === 'assistant' && message.id === turnId,
            );
            if (index < 0 || messages[index].content.includes(content)) {
                return state;
            }
            messages[index] = {
                ...messages[index],
                content: `${messages[index].content}\n\n${content}`,
            };
            return { messages };
        }),
    setLastAssistantSuggestions: (suggestions) =>
        set((state) => {
            const messages = [...state.messages];
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (messages[index].role === 'assistant') {
                    messages[index] = {
                        ...messages[index],
                        suggestions,
                    };
                    return { messages };
                }
            }
            return state;
        }),
    setAssistantSuggestions: (turnId, suggestions) =>
        set((state) => {
            const messages = [...state.messages];
            const index = messages.findLastIndex(
                (message) => message.role === 'assistant' && message.id === turnId,
            );
            if (index < 0) {
                return state;
            }
            messages[index] = {
                ...messages[index],
                suggestions,
            };
            return { messages };
        }),
    setActiveMissions: (missions) =>
        set({
            activeMissions: missions
                .map(sanitizeMission)
                .filter((mission): mission is PracticeMission => Boolean(mission))
                .slice(0, MAX_ACTIVE_MISSIONS),
        }),
    markMissionsPresented: (missionIds) =>
        set((state) => {
            if (missionIds.length === 0) return state;
            const presentedIds = new Set(missionIds);
            let changed = false;
            const activeMissions = state.activeMissions.map((mission) => {
                if (!mission.presentationPending || !presentedIds.has(mission.id)) return mission;
                changed = true;
                return { ...mission, presentationPending: undefined };
            });
            return changed ? { activeMissions } : state;
        }),
    addMissionCandidates: (missions) =>
        set((state) => {
            if (missions.length === 0) {
                return state;
            }

            const seen = new Set([
                ...state.activeMissions.map(getMissionKey),
                ...state.missionQueue.map(getMissionKey),
            ]);
            const completedMissionIds = new Set(
                state.messages.flatMap((message) => (
                    message.completedMissions?.map((completion) => completion.missionId) ?? []
                )),
            );
            const next = missions
                .map(sanitizeMission)
                .filter((mission): mission is PracticeMission => Boolean(mission))
                .map((mission) => {
                    const sourceMessage = findMissionSourceMessage(state.messages, mission.sourceTurnId);
                    return {
                        ...mission,
                        activatedAfterMessageKey: sourceMessage
                            ? getUserMessageKey(sourceMessage)
                            : mission.activatedAfterMessageKey ?? getLatestUserMessageKey(state.messages),
                    };
                })
                .filter((mission) => !completedMissionIds.has(mission.id))
                .filter((mission) => {
                    if (!mission.sourceTurnId) return true;
                    const sourceMessage = findMissionSourceMessage(state.messages, mission.sourceTurnId);
                    return !sourceMessage || !missionMatchesText(
                        sourceMessage.content,
                        mission,
                        sourceMessage.speechEvidence,
                    );
                })
                .filter((mission) => {
                    const key = getMissionKey(mission);
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
                .slice(0, MAX_QUEUED_MISSIONS);

            if (next.length === 0) return state;
            let rebuilt = {
                messages: state.messages,
                ...refillActiveMissions(
                state.activeMissions,
                [...state.missionQueue, ...next].slice(0, MAX_QUEUED_MISSIONS),
                ),
            };
            if (!state.isSessionReplay) return rebuilt;
            rebuilt.messages.forEach((message, index) => {
                if (message.role !== 'user') return;
                rebuilt = applyImmediateMissionCompletions(
                    rebuilt.messages,
                    index,
                    rebuilt.activeMissions,
                    rebuilt.missionQueue,
                    false,
                );
            });
            return rebuilt;
        }),
    assignLatestPendingUserTurnId: (turnId) =>
        set((state) => {
            if (state.messages.some((message) => message.role === 'user' && message.id === turnId)) {
                return state;
            }

            const messages = [...state.messages];
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (
                    messages[index].role === 'user' &&
                    !messages[index].id &&
                    messages[index].evaluationStatus === 'pending'
                ) {
                    messages[index] = {
                        ...messages[index],
                        id: turnId,
                    };
                    return { messages };
                }
            }
            return state;
        }),
    setTurnEvaluation: (turnId, evaluation) =>
        set((state) => {
            const messages = [...state.messages];
            const fallbackMatchIndex = messages.findLastIndex((message) => message.role === 'user' && message.id === turnId);

            if (fallbackMatchIndex >= 0) {
                const existingMessage = messages[fallbackMatchIndex];
                const canRecoverUnavailable = existingMessage.evaluationStatus === 'unavailable';
                if (existingMessage.evaluationStatus !== 'pending' && !canRecoverUnavailable) {
                    return state;
                }
                return applyEvaluationToMessage(
                    messages,
                    fallbackMatchIndex,
                    state.activeMissions,
                    state.missionQueue,
                    evaluation,
                );
            }

            const originalText = evaluation.correction.original.trim();
            if (originalText) {
                for (let index = messages.length - 1; index >= 0; index -= 1) {
                    if (
                        messages[index].role === 'user' &&
                        !messages[index].id &&
                        messages[index].evaluationStatus === 'pending' &&
                        messages[index].content.trim() === originalText
                    ) {
                        return applyEvaluationToMessage(
                            messages,
                            index,
                            state.activeMissions,
                            state.missionQueue,
                            evaluation,
                            turnId,
                        );
                    }
                }
            }
            return state;
        }),
    setTurnCorrection: (turnId, correction) =>
        set((state) => {
            const messages = [...state.messages];
            const fallbackMatchIndex = messages.findLastIndex((message) => message.role === 'user' && message.id === turnId);

            if (fallbackMatchIndex >= 0) {
                messages[fallbackMatchIndex] = {
                    ...messages[fallbackMatchIndex],
                    correction,
                    correctionStatus: 'ready',
                };
                return { messages };
            }

            const originalText = correction.original.trim();
            if (originalText) {
                for (let index = messages.length - 1; index >= 0; index -= 1) {
                    if (
                        messages[index].role === 'user' &&
                        !messages[index].id &&
                        messages[index].correctionStatus === 'pending' &&
                        messages[index].content.trim() === originalText
                    ) {
                        messages[index] = {
                            ...messages[index],
                            id: turnId,
                            correction,
                            correctionStatus: 'ready',
                        };
                        return { messages };
                    }
                }
            }
            return state;
        }),
    setEvaluationBatchStatus: (status) =>
        set((state) => {
            const existingStatus = state.evaluationBatchStatus;
            const incomingSessionEpoch = status.sessionEpoch;
            const existingSessionEpoch = existingStatus?.sessionEpoch;
            if (
                existingStatus
                && (
                    (typeof existingSessionEpoch === 'number' && typeof incomingSessionEpoch !== 'number')
                    || (typeof existingStatus.revision === 'number' && typeof status.revision !== 'number')
                )
            ) {
                return state;
            }
            if (
                typeof incomingSessionEpoch === 'number'
                && typeof existingSessionEpoch === 'number'
                && incomingSessionEpoch < existingSessionEpoch
            ) {
                return state;
            }
            const isSameSession = incomingSessionEpoch === undefined
                || existingSessionEpoch === undefined
                || incomingSessionEpoch === existingSessionEpoch;
            if (
                isSameSession
                && typeof status.revision === 'number'
                && typeof existingStatus?.revision === 'number'
                && (
                    status.revision < existingStatus.revision
                    || (existingStatus.optimistic && status.revision === existingStatus.revision)
                )
            ) {
                return state;
            }

            const receivedAtEpochMs = Date.now();
            const delaySeconds = Math.max(0, status.delaySeconds);
            const sourceNextFlushAtEpochMs = status.nextFlushAtEpochMs ?? null;
            const sameServerDeadline = sourceNextFlushAtEpochMs !== null
                && state.evaluationBatchStatus?.sourceNextFlushAtEpochMs === sourceNextFlushAtEpochMs;
            let nextFlushAtEpochMs: number | null = null;

            if (sourceNextFlushAtEpochMs !== null) {
                if (sameServerDeadline && state.evaluationBatchStatus?.nextFlushAtEpochMs) {
                    nextFlushAtEpochMs = state.evaluationBatchStatus.nextFlushAtEpochMs;
                } else {
                    const serverEpochMs = status.serverEpochMs;
                    const remainingMs = typeof serverEpochMs === 'number' && Number.isFinite(serverEpochMs)
                        ? sourceNextFlushAtEpochMs - serverEpochMs
                        : delaySeconds * 1000;
                    nextFlushAtEpochMs = receivedAtEpochMs
                        + Math.max(0, Math.min(delaySeconds * 1000, remainingMs));
                }
            }

            return {
                evaluationBatchStatus: {
                    pendingCount: Math.max(0, Math.floor(status.pendingCount)),
                    inFlightCount: Math.max(0, Math.floor(status.inFlightCount ?? 0)),
                    phase: status.phase,
                    revision: status.revision,
                    sessionEpoch: status.sessionEpoch,
                    optimistic: false,
                    maxTurns: Math.max(1, Math.floor(status.maxTurns)),
                    delaySeconds,
                    nextFlushAtEpochMs,
                    sourceNextFlushAtEpochMs,
                    serverEpochMs: status.serverEpochMs ?? null,
                    receivedAtEpochMs,
                },
            };
        }),
    queueLocalEvaluationBatchTurn: (delaySeconds, maxTurns, sessionEpoch) =>
        set((state) => {
            const now = Date.now();
            const normalizedMaxTurns = Math.max(1, Math.floor(maxTurns));
            const existing = state.evaluationBatchStatus;
            const existingPending = existing?.pendingCount ?? 0;
            const sameSession = sessionEpoch === undefined
                || existing?.sessionEpoch === undefined
                || sessionEpoch === existing.sessionEpoch;
            const nextPending = Math.min(normalizedMaxTurns, existingPending + 1);
            const nextFlushAtEpochMs = existing?.nextFlushAtEpochMs && existingPending > 0
                ? existing.nextFlushAtEpochMs
                : now + Math.max(0, delaySeconds) * 1000;

            return {
                evaluationBatchStatus: {
                    pendingCount: nextPending,
                    inFlightCount: existing?.inFlightCount ?? 0,
                    phase: (existing?.inFlightCount ?? 0) > 0 ? 'evaluating' : 'queued',
                    revision: sameSession ? existing?.revision : undefined,
                    sessionEpoch: sessionEpoch ?? existing?.sessionEpoch,
                    optimistic: true,
                    maxTurns: normalizedMaxTurns,
                    delaySeconds: Math.max(0, delaySeconds),
                    nextFlushAtEpochMs,
                    sourceNextFlushAtEpochMs: undefined,
                    serverEpochMs: undefined,
                    receivedAtEpochMs: now,
                },
            };
        }),
    clearEvaluationBatchStatus: () => set({ evaluationBatchStatus: null }),
    setTurnEvaluationUnavailable: (turnId, code) =>
        set((state) => {
            const messages = [...state.messages];
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (
                    messages[index].role === 'user' &&
                    messages[index].id === turnId &&
                    messages[index].evaluationStatus === 'pending'
                ) {
                    messages[index] = {
                        ...messages[index],
                        evaluationStatus: 'unavailable',
                        evaluationErrorCode: code,
                    };
                    return { messages };
                }
            }
            return state;
        }),
    getPendingEvaluationTurnIds: () =>
        get()
            .messages
            .filter((message) => message.role === 'user' && message.id && message.evaluationStatus === 'pending')
            .map((message) => message.id as string),
    skipPendingTurnEvaluations: (reason) =>
        set((state) => {
            let changed = false;
            const messages = state.messages.map((message) => {
                if (message.role !== 'user' || message.evaluationStatus !== 'pending') {
                    return message;
                }

                changed = true;
                return {
                    ...message,
                    evaluationStatus: 'skipped' as const,
                    evaluationSkipReason: reason,
                };
            });

            if (!changed && !state.evaluationBatchStatus) {
                return state;
            }

            return {
                messages,
                evaluationBatchStatus: null,
            };
        }),
    setTurnCorrectionUnavailable: (turnId, code) =>
        set((state) => {
            const messages = [...state.messages];
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (
                    messages[index].role === 'user' &&
                    messages[index].id === turnId &&
                    messages[index].correctionStatus === 'pending'
                ) {
                    messages[index] = {
                        ...messages[index],
                        correctionStatus: 'unavailable',
                        correctionErrorCode: code,
                    };
                    return { messages };
                }
            }
            return state;
        }),
    setTurnCorrectionSkipped: (turnId, reason) =>
        set((state) => {
            const messages = [...state.messages];
            let latestUnboundPendingIndex = -1;
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (
                    latestUnboundPendingIndex < 0 &&
                    messages[index].role === 'user' &&
                    !messages[index].id &&
                    messages[index].correctionStatus === 'pending'
                ) {
                    latestUnboundPendingIndex = index;
                }

                if (
                    messages[index].role === 'user' &&
                    messages[index].id === turnId &&
                    messages[index].correctionStatus === 'pending'
                ) {
                    messages[index] = {
                        ...messages[index],
                        correctionStatus: 'skipped',
                        correctionSkipReason: reason,
                    };
                    return { messages };
                }
            }

            if (latestUnboundPendingIndex >= 0) {
                messages[latestUnboundPendingIndex] = {
                    ...messages[latestUnboundPendingIndex],
                    id: turnId,
                    correctionStatus: 'skipped',
                    correctionSkipReason: reason,
                };
                return { messages };
            }

            return state;
        }),
    setTurnEvaluationSkipped: (turnId, reason) =>
        set((state) => {
            const messages = [...state.messages];
            let latestUnboundPendingIndex = -1;
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (
                    latestUnboundPendingIndex < 0 &&
                    messages[index].role === 'user' &&
                    !messages[index].id &&
                    messages[index].evaluationStatus === 'pending'
                ) {
                    latestUnboundPendingIndex = index;
                }

                if (
                    messages[index].role === 'user' &&
                    messages[index].id === turnId &&
                    messages[index].evaluationStatus === 'pending'
                ) {
                    messages[index] = {
                        ...messages[index],
                        evaluationStatus: 'skipped',
                        evaluationSkipReason: reason,
                    };
                    return { messages };
                }
            }

            if (latestUnboundPendingIndex >= 0) {
                messages[latestUnboundPendingIndex] = {
                    ...messages[latestUnboundPendingIndex],
                    id: turnId,
                    evaluationStatus: 'skipped',
                    evaluationSkipReason: reason,
                };
                return { messages };
            }

            return state;
        }),
    setPartialMessage: (message) => set({ partialMessage: message }),
    setLiveTranscript: (transcript) => set({ liveTranscript: transcript }),
    clearMessages: () => set({
        messages: [],
        learningSessionId: null,
        topicSegments: [],
        activeSegmentId: null,
        conversationStartStatus: 'idle',
        conversationStartError: null,
        liveTranscript: '',
        evaluationBatchStatus: null,
        activeMissions: [],
        missionQueue: [],
        missionReplaySnapshot: null,
        sessionReplayMessageKeys: [],
        isSessionReplay: false,
    }),
    setConversationState: (learningSessionId, topicSegments, activeSegmentId) => set({
        learningSessionId,
        topicSegments,
        activeSegmentId,
    }),
    upsertTopicSegment: (segment, learningSessionId) => set((state) => {
        const topicSegments = state.topicSegments.map((candidate) => (
            segment.status === 'active'
            && candidate.segmentId !== segment.segmentId
            && candidate.status === 'active'
                ? { ...candidate, status: 'ended' as const }
                : candidate
        ));
        const existingIndex = topicSegments.findIndex(
            (candidate) => candidate.segmentId === segment.segmentId,
        );
        if (existingIndex >= 0) {
            topicSegments[existingIndex] = { ...topicSegments[existingIndex], ...segment };
        } else {
            topicSegments.push(segment);
            topicSegments.sort((left, right) => left.sequence - right.sequence);
        }
        return {
            learningSessionId: learningSessionId ?? state.learningSessionId,
            topicSegments,
            activeSegmentId: segment.status === 'active' ? segment.segmentId : state.activeSegmentId,
        };
    }),
    setConversationStartStatus: (conversationStartStatus, conversationStartError = null) => set({
        conversationStartStatus,
        conversationStartError,
    }),
    beginSessionReplay: () => set((state) => {
        const missionReplaySnapshot: MissionReplaySnapshot = {};
        state.messages.forEach((message) => {
            if (message.role !== 'user') return;
            if (!message.pendingMissionCompletions?.length && !message.completedMissions?.length) return;
            missionReplaySnapshot[getUserMessageKey(message)] = {
                pendingMissionCompletions: message.pendingMissionCompletions,
                completedMissions: message.completedMissions,
            };
        });
        return {
            evaluationBatchStatus: null,
            missionReplaySnapshot,
            sessionReplayMessageKeys: [],
            isSessionReplay: true,
        };
    }),
    reconcileSessionReplayPendingEvaluations: (replayedMessageKeys) => set((state) => {
        const keys = replayedMessageKeys ?? state.sessionReplayMessageKeys;
        if (keys.length === 0) {
            return state;
        }

        const replayedKeys = new Set(keys);
        let changed = false;
        const messages = state.messages.map((message) => {
            if (
                message.role !== 'user'
                || message.evaluationStatus !== 'pending'
                || !replayedKeys.has(getSessionReplayMessageKey(message.role, message.id, message.content))
            ) {
                return message;
            }
            changed = true;
            return {
                ...message,
                evaluationStatus: 'unavailable' as const,
                evaluationErrorCode: 'stale_replay',
            };
        });

        return changed ? { messages } : state;
    }),
    finishSessionReplay: () => set((state) => {
        const replayedKeys = new Set(state.sessionReplayMessageKeys);
        const messages = state.messages.filter((message) => (
            replayedKeys.has(getSessionReplayMessageKey(message.role, message.id, message.content))
        ));
        const hasReplayedUserMessage = messages.some((message) => message.role === 'user');
        return {
            messages,
            missionReplaySnapshot: null,
            sessionReplayMessageKeys: [],
            isSessionReplay: false,
            activeMissions: hasReplayedUserMessage ? state.activeMissions : [],
            missionQueue: hasReplayedUserMessage ? state.missionQueue : [],
        };
    }),
    setVoice: (voice) => set({ voice }),
    setSpeed: (speed) => set({ speed }),
    setTextScale: (textScale) => set({ textScale }),
    toggleKoreanInterpretation: () =>
        set((state) => ({ showKoreanInterpretation: !state.showKoreanInterpretation })),
    setShowReplySuggestions: (showReplySuggestions) => set({ showReplySuggestions }),
    toggleReplySuggestions: () =>
        set((state) => ({ showReplySuggestions: !state.showReplySuggestions })),
    setAvatarName: (name) => set({ avatarName: name }),
    setCurrentAvatar: (id) => {
        const voiceId = AVATAR_VOICE_MAP[id] || DEFAULT_VOICE_ID;
        set({ currentAvatarId: id, voice: voiceId });
    },
    toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),

    audioAnalyser: null,
    setAudioAnalyser: (analyser) => set({ audioAnalyser: analyser }),

    emotion: 'neutral',
    setEmotion: (emotion) => set({ emotion }),

    isThinking: false,
    setThinking: (isThinking: boolean) => set({ isThinking }),
    setLipSyncMode: (lipSyncMode) => set({ lipSyncMode }),
    upsertTtsSegment: (segment) =>
        set((state) => ({
            ttsSegments: {
                ...state.ttsSegments,
                [segment.segmentId]: {
                    ...state.ttsSegments[segment.segmentId],
                    ...segment,
                },
            },
        })),
    patchTtsSegment: (segmentId, patch) =>
        set((state) => {
            const existing = state.ttsSegments[segmentId];
            if (!existing) {
                return state;
            }
            return {
                ttsSegments: {
                    ...state.ttsSegments,
                    [segmentId]: {
                        ...existing,
                        ...patch,
                    },
                },
            };
        }),
    removeTtsSegment: (segmentId) =>
        set((state) => {
            const nextSegments = { ...state.ttsSegments };
            delete nextSegments[segmentId];
            return { ttsSegments: nextSegments };
        }),
    clearTtsSegments: (responseId) =>
        set((state) => {
            if (!responseId) {
                return { ttsSegments: {} };
            }
            const filtered = Object.fromEntries(
                Object.entries(state.ttsSegments).filter(([, segment]) => segment.responseId !== responseId),
            );
            return { ttsSegments: filtered };
        }),
    setLipSyncDebugEnabled: (lipSyncDebugEnabled) => set({ lipSyncDebugEnabled }),
    setCurrentLipSyncSnapshot: (currentLipSyncSnapshot) => set({ currentLipSyncSnapshot }),

    socket: null,
    setSocket: (socket: WebSocket | null) => set({ socket }),
}));
