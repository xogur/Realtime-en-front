
import { create } from 'zustand';
import type {
    LipSyncDebugSnapshot,
    LipSyncMode,
    ScheduledTtsSegment,
    Emotion,
} from '@/lib/lipsync/types';

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
    };
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
    value?: string | string[];
    min?: number;
};

export type PracticeMission = {
    id: string;
    kind: MissionKind;
    title: string;
    target: string;
    successHint: string;
    rewardLp: number;
    checks: MissionCheck[];
    matchMode?: 'all' | 'any';
    createdAt: string;
    sourceTurnId?: string;
    activatedAfterMessageKey?: string;
};

export type MissionCompletion = {
    missionId: string;
    title: string;
    target: string;
    rewardLp: number;
    reason: string;
};

export type ChatMessage = {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    suggestions?: string[];
    evaluation?: TurnEvaluation;
    evaluationStatus?: 'pending' | 'ready' | 'unavailable';
    evaluationErrorCode?: string;
    completedMissions?: MissionCompletion[];
    attemptedMission?: PracticeMission;
};

interface AppState {
    isConnecting: boolean;
    isConnected: boolean;
    isRecording: boolean;
    isPlaying: boolean;
    volume: number; // 0 to 1, for visualizer
    messages: ChatMessage[];
    activeMissions: PracticeMission[];
    missionQueue: PracticeMission[];
    partialMessage: string;
    setPartialMessage: (message: string) => void;
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
    avatarName: 'model' | 'avatar';

    setConnecting: (status: boolean) => void;
    setConnected: (status: boolean) => void;
    setRecording: (status: boolean) => void;
    setPlaying: (status: boolean) => void;
    setVolume: (volume: number) => void;
    addMessage: (role: 'user' | 'assistant', content: string, id?: string) => void;
    syncMessages: (messages: ChatMessage[]) => void;
    appendToLastAssistantMessage: (content: string) => void;
    setLastAssistantSuggestions: (suggestions: string[]) => void;
    setActiveMissions: (missions: PracticeMission[]) => void;
    addMissionCandidates: (missions: PracticeMission[]) => void;
    assignLatestPendingUserTurnId: (turnId: string) => void;
    setTurnEvaluation: (turnId: string, evaluation: TurnEvaluation) => void;
    setTurnEvaluationUnavailable: (turnId: string, code?: string) => void;
    setVoice: (voice: string) => void;
    setSpeed: (speed: number) => void;
    setTextScale: (scale: number) => void;
    toggleKoreanInterpretation: () => void;
    setAvatarName: (name: 'model' | 'avatar') => void;

    socket: WebSocket | null;
    setSocket: (socket: WebSocket | null) => void;

    clearMessages: () => void;
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

function wordCount(text: string): number {
    return text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0;
}

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

function checkMissionRule(text: string, check: MissionCheck): boolean {
    const normalized = normalizeMissionText(text);
    const values = Array.isArray(check.value) ? check.value : check.value ? [check.value] : [];

    switch (check.type) {
        case 'minWords':
            return wordCount(text) >= (check.min ?? 8);
        case 'includesAny':
            return values.length > 0 && textIncludesAny(text, values);
        case 'sentenceCount':
            return text.split(/[.!?]+/).filter((part) => wordCount(part) > 0).length >= (check.min ?? 2);
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

function missionMatchesText(text: string, mission: PracticeMission): boolean {
    if (mission.checks.length === 0) return false;
    const results = mission.checks.map((check) => checkMissionRule(text, check));
    return mission.matchMode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function completeMissions(text: string, missions: PracticeMission[]): MissionCompletion[] {
    return missions
        .filter((mission) => missionMatchesText(text, mission))
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
    return `${mission.kind}:${normalizeMissionText(mission.target)}`;
}

function getUserMessageKey(message: Pick<ChatMessage, 'id' | 'content'>): string {
    return message.id ? `id:${message.id}` : `text:${normalizeMissionText(message.content)}`;
}

function getLatestUserMessageKey(messages: ChatMessage[]): string | undefined {
    const latestUserMessage = messages.findLast((message) => message.role === 'user');
    return latestUserMessage ? getUserMessageKey(latestUserMessage) : undefined;
}

function refillActiveMissions(activeMissions: PracticeMission[], missionQueue: PracticeMission[], activatedAfterMessageKey?: string) {
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
            })),
        ].slice(0, MAX_ACTIVE_MISSIONS),
        missionQueue: missionQueue.slice(availableSlots, availableSlots + MAX_QUEUED_MISSIONS),
    };
}

function getApplicableMissionsForMessage(messages: ChatMessage[], messageIndex: number, missions: PracticeMission[]): PracticeMission[] {
    return missions.filter((mission) => {
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

function applyMissionCompletionsToMessages(messages: ChatMessage[], missions: PracticeMission[]) {
    let activeMissions = missions;
    let changed = false;
    let completedMessageKey: string | undefined;
    const nextMessages = [...messages];
    const messageIndex = messages.findLastIndex((message) => message.role === 'user');
    const message = messageIndex >= 0 ? messages[messageIndex] : null;

    if (message && activeMissions.length > 0) {
        const applicableMissions = getApplicableMissionsForMessage(messages, messageIndex, activeMissions);
        const completions = completeMissions(message.content, applicableMissions);
        if (completions.length > 0) {
            const completedMissions = mergeUniqueCompletions(message.completedMissions, completions);
            const completedIds = new Set(completedMissions.map((mission) => mission.missionId));
            activeMissions = activeMissions.filter((mission) => !completedIds.has(mission.id));
            nextMessages[messageIndex] = {
                ...message,
                completedMissions,
            };
            changed = true;
            completedMessageKey = getUserMessageKey(message);
        }
    }

    return { messages: changed ? nextMessages : messages, activeMissions, completedMessageKey };
}

function sanitizeMission(mission: PracticeMission): PracticeMission | null {
    if (!mission.id || !mission.target || !mission.title || !Array.isArray(mission.checks)) return null;
    const localized = localizeMission(mission);
    return {
        ...localized,
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
    return Array.isArray(check.value) ? check.value : [check.value];
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
                    ? `답변에 ${values.join(', ')} 중 하나를 사용해보세요.`
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

export const useStore = create<AppState>((set) => ({
    isConnecting: false,
    isConnected: false,
    isRecording: false,
    isPlaying: false,
    volume: 0,
    messages: [],
    activeMissions: [],
    missionQueue: [],
    partialMessage: '',
    isChatOpen: false, // Default closed
    voice: DEFAULT_VOICE_ID,
    speed: 0.8,
    textScale: 1.0,
    showKoreanInterpretation: true,
    avatarName: 'avatar',
    currentAvatarId: DEFAULT_AVATAR_ID,
    lipSyncMode: 'heuristic',
    ttsSegments: {},
    lipSyncDebugEnabled: false,
    currentLipSyncSnapshot: null,

    setConnecting: (status) => set({ isConnecting: status }),
    setConnected: (status) => set({ isConnected: status }),
    setRecording: (status) => set({ isRecording: status }),
    setPlaying: (status) => set({ isPlaying: status }),
    setVolume: (volume) => set({ volume }),
    addMessage: (role, content, id) =>
        set((state) => {
            if (role === 'user' && id) {
                const existingIndex = state.messages.findIndex((message) => message.role === 'user' && message.id === id);
                if (existingIndex >= 0) {
                    const messages = [...state.messages];
                    const existingMessage = messages[existingIndex];
                    const candidateMessages = [...messages];
                    candidateMessages[existingIndex] = {
                        ...existingMessage,
                        content,
                    };
                    const completions = completeMissions(
                        content,
                        getApplicableMissionsForMessage(candidateMessages, existingIndex, state.activeMissions),
                    );
                    const completedMissions = mergeUniqueCompletions(existingMessage.completedMissions, completions);
                    const completedIds = new Set(completedMissions.map((mission) => mission.missionId));
                    const missions = refillActiveMissions(
                        state.activeMissions.filter((mission) => !completedIds.has(mission.id)),
                        state.missionQueue,
                        getUserMessageKey({ id, content }),
                    );

                    messages[existingIndex] = {
                        ...existingMessage,
                        content,
                        evaluationStatus: existingMessage.evaluationStatus ?? 'pending',
                        completedMissions: completedMissions.length > 0 ? completedMissions : undefined,
                    };

                    return {
                        activeMissions: missions.activeMissions,
                        missionQueue: missions.missionQueue,
                        messages,
                    };
                }
            }

            const candidateMessages = [
                ...state.messages,
                {
                    id,
                    role,
                    content,
                },
            ];
            const completedMissions = role === 'user'
                ? completeMissions(
                    content,
                    getApplicableMissionsForMessage(candidateMessages, candidateMessages.length - 1, state.activeMissions),
                )
                : [];
            const completedIds = new Set(completedMissions.map((mission) => mission.missionId));
            const missions = role === 'user'
                ? refillActiveMissions(
                    state.activeMissions.filter((mission) => !completedIds.has(mission.id)),
                    state.missionQueue,
                    getUserMessageKey({ id, content }),
                )
                : {
                    activeMissions: state.activeMissions,
                    missionQueue: state.missionQueue,
                };

            return {
                activeMissions: missions.activeMissions,
                missionQueue: missions.missionQueue,
                messages: [
                    ...state.messages,
                    {
                        id,
                        role,
                        content,
                        evaluationStatus: role === 'user' ? 'pending' : undefined,
                        completedMissions: completedMissions.length > 0 ? completedMissions : undefined,
                    },
                ],
            };
        }),
    syncMessages: (messages) =>
        set((state) => {
            const synced = applyMissionCompletionsToMessages(messages, state.activeMissions);
            const missions = refillActiveMissions(synced.activeMissions, state.missionQueue, synced.completedMessageKey);
            return {
                messages: synced.messages,
                activeMissions: missions.activeMissions,
                missionQueue: missions.missionQueue,
            };
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
    setActiveMissions: (missions) =>
        set({
            activeMissions: missions
                .map(sanitizeMission)
                .filter((mission): mission is PracticeMission => Boolean(mission))
                .slice(0, MAX_ACTIVE_MISSIONS),
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
            const next = missions
                .map(sanitizeMission)
                .filter((mission): mission is PracticeMission => Boolean(mission))
                .filter((mission) => {
                    if (!mission.sourceTurnId) return true;
                    const sourceMessage = state.messages.find((message) => message.role === 'user' && message.id === mission.sourceTurnId);
                    return !sourceMessage || !missionMatchesText(sourceMessage.content, mission);
                })
                .filter((mission) => {
                    const key = getMissionKey(mission);
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                })
                .slice(0, MAX_QUEUED_MISSIONS);

            if (next.length === 0) return state;
            return refillActiveMissions(
                state.activeMissions,
                [...state.missionQueue, ...next].slice(0, MAX_QUEUED_MISSIONS),
                getLatestUserMessageKey(state.messages),
            );
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
                messages[fallbackMatchIndex] = {
                    ...messages[fallbackMatchIndex],
                    evaluation,
                    evaluationStatus: 'ready',
                };
                return { messages };
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
                        messages[index] = {
                            ...messages[index],
                            id: turnId,
                            evaluation,
                            evaluationStatus: 'ready',
                        };
                        return { messages };
                    }
                }
            }
            return state;
        }),
    setTurnEvaluationUnavailable: (turnId, code) =>
        set((state) => {
            const messages = [...state.messages];
            for (let index = messages.length - 1; index >= 0; index -= 1) {
                if (messages[index].role === 'user' && messages[index].id === turnId) {
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
    setPartialMessage: (message) => set({ partialMessage: message }),
    clearMessages: () => set({ messages: [], activeMissions: [], missionQueue: [] }),
    setVoice: (voice) => set({ voice }),
    setSpeed: (speed) => set({ speed }),
    setTextScale: (textScale) => set({ textScale }),
    toggleKoreanInterpretation: () =>
        set((state) => ({ showKoreanInterpretation: !state.showKoreanInterpretation })),
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
