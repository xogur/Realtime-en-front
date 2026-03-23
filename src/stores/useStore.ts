
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
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
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
    avatarName: 'model' | 'avatar';

    setConnecting: (status: boolean) => void;
    setConnected: (status: boolean) => void;
    setRecording: (status: boolean) => void;
    setPlaying: (status: boolean) => void;
    setVolume: (volume: number) => void;
    addMessage: (role: 'user' | 'assistant', content: string) => void;
    setVoice: (voice: string) => void;
    setSpeed: (speed: number) => void;
    setTextScale: (scale: number) => void;
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
    'model': 'sohee', 
    'avatar': 'sohee',
};

export const useStore = create<AppState>((set) => ({
    isConnecting: false,
    isConnected: false,
    isRecording: false,
    isPlaying: false,
    volume: 0,
    messages: [],
    partialMessage: '',
    isChatOpen: false, // Default closed
    voice: 'Sohee', // Updated default to match avatar ID
    speed: 0.8,
    textScale: 1.0,
    avatarName: 'avatar',
    currentAvatarId: 'Sohee',
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
    setPartialMessage: (message) => set({ partialMessage: message }),
    clearMessages: () => set({ messages: [] }),
    setVoice: (voice) => set({ voice }),
    setSpeed: (speed) => set({ speed }),
    setTextScale: (textScale) => set({ textScale }),
    setAvatarName: (name) => set({ avatarName: name }),
    setCurrentAvatar: (id) => {
        const voiceId = AVATAR_VOICE_MAP[id] || 'Sohee';
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
