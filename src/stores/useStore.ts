
import { create } from 'zustand';
import type {
    LipSyncDebugSnapshot,
    LipSyncMode,
    ScheduledTtsSegment,
    Emotion,
} from '@/lib/lipsync/types';

interface AppState {
    isConnecting: boolean;
    isConnected: boolean;
    isRecording: boolean;
    isPlaying: boolean;
    volume: number; // 0 to 1, for visualizer
    messages: Array<{ role: 'user' | 'assistant'; content: string; suggestions?: string[] }>;
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
    addMessage: (role: 'user' | 'assistant', content: string) => void;
    appendToLastAssistantMessage: (content: string) => void;
    setLastAssistantSuggestions: (suggestions: string[]) => void;
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

export const useStore = create<AppState>((set) => ({
    isConnecting: false,
    isConnected: false,
    isRecording: false,
    isPlaying: false,
    volume: 0,
    messages: [],
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
    addMessage: (role, content) =>
        set((state) => ({ messages: [...state.messages, { role, content }] })),
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
    setPartialMessage: (message) => set({ partialMessage: message }),
    clearMessages: () => set({ messages: [] }),
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
