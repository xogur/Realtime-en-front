import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, Mic, MicOff, Trash2, Loader2 } from 'lucide-react';
// import { Settings, MessageSquare } from 'lucide-react';
import { useVoiceSocket } from '@/hooks/useVoiceSocket';
import { TopicSelector } from '@/components/TopicSelector';
import { getConversationTopic, type TopicId } from '@/lib/conversationTopics';
import { getConversationDifficulty, type DifficultyId } from '@/lib/conversationDifficulties';
import { TEXT_ONLY_TEST_MODE } from '@/lib/testMode';
import { isTranslatorWindowMessage, TRANSLATOR_WINDOW_MESSAGE } from '@/lib/translator';
// import { buildKioskUrl } from '@/lib/kioskIdentity';

interface ControlPanelProps {
    onOpenSettings: () => void;
}

// 설정 버튼 복원 시 onOpenSettings가 다시 사용됩니다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ControlPanel({ onOpenSettings }: ControlPanelProps) {
    const {
        startListening,
        startConversation,
        resumeConversation,
        stopListening,
        isConnected,
        isSttReady,
        isRecording,
        sttProvider,
        clearHistory,
    } = useVoiceSocket();
    const isConnecting = useStore((state) => state.isConnecting);
    const activeSegmentId = useStore((state) => state.activeSegmentId);
    const topicSegments = useStore((state) => state.topicSegments);
    const conversationStartStatus = useStore((state) => state.conversationStartStatus);
    const conversationStartError = useStore((state) => state.conversationStartError);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isTopicSelectorOpen, setIsTopicSelectorOpen] = useState(false);
    const isTranslatorOpenRef = useRef(false);
    const resumeAfterTranslatorRef = useRef(false);
    const activeSegment = topicSegments.find((segment) => segment.segmentId === activeSegmentId);
    const activeTopic = getConversationTopic(activeSegment?.topicId);
    const activeDifficulty = getConversationDifficulty(activeSegment?.difficultyId);
    const isLive = isConnected && isSttReady && isRecording;
    const isPreparingStt = isConnecting;
    const isTextTestActive = TEXT_ONLY_TEST_MODE && isConnected && Boolean(activeTopic);
    const isSttUnavailable = isConnected
        && !isSttReady
        && !isConnecting
        && conversationStartStatus === 'error';

    useEffect(() => useStore.subscribe((state, previousState) => {
        if (
            state.conversationStartStatus === 'opening'
            && previousState.conversationStartStatus !== 'opening'
        ) {
            setIsTopicSelectorOpen(false);
        }
    }), []);

    const handleToggleConnection = useCallback(() => {
        if (isProcessing || isConnecting) return;

        if (TEXT_ONLY_TEST_MODE) {
            setIsTopicSelectorOpen(true);
            return;
        }

        if (isConnected && isRecording) {
            setIsProcessing(true);
            stopListening();
            setTimeout(() => setIsProcessing(false), 500);
        } else {
            setIsTopicSelectorOpen(true);
        }
    }, [isConnected, isRecording, stopListening, isProcessing, isConnecting]);

    const handleSelectTopic = useCallback((topicId: TopicId, difficultyId: DifficultyId) => {
        startConversation(topicId, difficultyId);
    }, [startConversation]);

    const handleResume = useCallback(() => {
        setIsTopicSelectorOpen(false);
        if (activeSegment) {
            resumeConversation(activeSegment.segmentId);
        } else {
            startListening();
        }
    }, [activeSegment, resumeConversation, startListening]);

    const handleChangeTopic = useCallback(() => {
        if (isRecording) {
            stopListening();
        }
        setIsTopicSelectorOpen(true);
    }, [isRecording, stopListening]);

    useEffect(() => {
        const handleTranslatorMessage = (event: MessageEvent) => {
            if (event.origin && event.origin !== window.location.origin) return;
            if (!isTranslatorWindowMessage(event.data)) return;

            const nextOpen = event.data.action === 'open';
            if (isTranslatorOpenRef.current === nextOpen) return;
            isTranslatorOpenRef.current = nextOpen;

            if (nextOpen) {
                setIsTopicSelectorOpen(false);
                resumeAfterTranslatorRef.current = isRecording;
                if (isRecording) stopListening();
                return;
            }

            if (resumeAfterTranslatorRef.current) {
                resumeAfterTranslatorRef.current = false;
                startListening();
            }
        };
        window.addEventListener('message', handleTranslatorMessage);

        const channel = 'BroadcastChannel' in window
            ? new BroadcastChannel(TRANSLATOR_WINDOW_MESSAGE)
            : null;
        channel?.addEventListener('message', handleTranslatorMessage);

        return () => {
            window.removeEventListener('message', handleTranslatorMessage);
            channel?.removeEventListener('message', handleTranslatorMessage);
            channel?.close();
        };
    }, [isRecording, startListening, stopListening]);

    return (
        <>
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, type: 'spring' }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 p-4 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-glass z-50"
        >
            {activeTopic && (
                <button
                    type="button"
                    onClick={handleChangeTopic}
                    className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/50 bg-white/85 px-4 py-2 text-sm font-extrabold text-zinc-800 shadow-lg backdrop-blur-md transition hover:bg-white"
                    aria-label={`현재 주제 ${activeTopic.label}. 주제 변경`}
                >
                    {activeTopic.label}{activeDifficulty ? ` · ${activeDifficulty.label}` : ''}
                    {activeSegment && activeSegment.occurrence > 1 ? ` ${activeSegment.occurrence}회차` : ''}
                    <span className="ml-2 text-xs font-bold text-blue-600">주제 변경</span>
                </button>
            )}
            <button
                onClick={() => {
                    if (window.confirm('Reset all conversation history? This cannot be undone.')) {
                        setIsTopicSelectorOpen(false);
                        clearHistory();
                    }
                }}
                className="p-3 rounded-full border border-white/15 bg-white/5 text-red-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] transition-all hover:bg-white/20 hover:text-red-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/90 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                aria-label="Reset Conversation"
                title="Reset conversation"
            >
                <Trash2 className="w-6 h-6" />
            </button>

            {/* 실제 운영 환경에서는 설정 버튼을 사용하지 않습니다.
            <button
                onClick={onOpenSettings}
                className="p-3 rounded-full border border-white/15 bg-white/5 text-sky-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] transition-all hover:bg-white/20 hover:text-sky-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/90 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                aria-label="Settings"
                title="Settings"
            >
                <Settings className="w-6 h-6" />
            </button>

            <button
                onClick={() => {
                    window.open(buildKioskUrl('/chat'), 'UXROOM_Chat', 'width=450,height=850,menubar=no,toolbar=no,location=no,status=no');
                }}
                className="p-3 rounded-full border border-white/15 bg-white/5 text-amber-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] transition-all hover:bg-white/20 hover:text-amber-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/90 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                aria-label="Open Chat Window"
                title="Open chat window"
            >
                <MessageSquare className="w-6 h-6" />
            </button>
            */}

            <button
                onClick={handleToggleConnection}
                disabled={isProcessing || isConnecting}
                className={`relative flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-75 ${isConnecting || isProcessing
                    ? 'bg-blue-600 text-white shadow-blue-500/30'
                    : isLive && !TEXT_ONLY_TEST_MODE
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                        : isTextTestActive
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30'
                            : 'bg-zinc-700 hover:bg-zinc-600 text-white shadow-black/35'
                    }`}
                aria-label={TEXT_ONLY_TEST_MODE ? 'Choose conversation topic' : isLive ? 'Turn microphone off' : 'Turn microphone on'}
                title={TEXT_ONLY_TEST_MODE ? 'Choose conversation topic' : isLive ? 'Turn microphone off' : 'Turn microphone on'}
            >
                <AnimatePresence mode="wait">
                    {isPreparingStt || isProcessing ? (
                        <motion.div
                            key="connecting"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                        >
                            <Loader2 className="w-8 h-8 animate-spin" />
                        </motion.div>
                    ) : TEXT_ONLY_TEST_MODE ? (
                        <motion.div
                            key="text-test"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                        >
                            <Keyboard className="w-8 h-8" />
                        </motion.div>
                    ) : isLive ? (
                        <motion.div
                            key="connected"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                        >
                            <Mic className="w-8 h-8" />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="disconnected"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                        >
                            <MicOff className="w-8 h-8" />
                            <span className="absolute inset-0 rounded-full border-2 border-zinc-900 opacity-20 animate-ping" />
                        </motion.div>
                    )}
                </AnimatePresence>
            </button>

            <div className="flex flex-col items-start w-24">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isPreparingStt ? 'bg-blue-500 animate-pulse' :
                        isTextTestActive ? 'bg-blue-500 animate-pulse' :
                        isLive ? 'bg-green-500 animate-pulse' : isSttUnavailable ? 'bg-red-500' : isConnected ? 'bg-amber-500' : 'bg-zinc-300'
                        }`} />
                    <span className="text-xs font-semibold text-zinc-100">
                        {isPreparingStt
                            ? TEXT_ONLY_TEST_MODE ? 'Connecting' : 'Preparing STT'
                            : isTextTestActive
                                ? 'Text test mode'
                            : isLive
                                ? sttProvider === 'browser' ? 'Web Speech' : 'Server STT'
                                : isSttUnavailable ? 'STT unavailable' : isConnected ? 'Mic off' : 'Offline'}
                    </span>
                </div>
            </div>
        </motion.div>
        <TopicSelector
            isOpen={isTopicSelectorOpen}
            currentTopicId={activeSegment?.topicId}
            currentDifficultyId={activeSegment?.difficultyId}
            isBusy={conversationStartStatus === 'preparing'}
            error={conversationStartError}
            onSelect={handleSelectTopic}
            onResume={activeSegment ? handleResume : undefined}
            onClose={() => setIsTopicSelectorOpen(false)}
        />
        </>
    );
}
