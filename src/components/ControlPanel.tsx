import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, LogOut, Mic, MicOff, Trash2, Loader2 } from 'lucide-react';
// import { Settings, MessageSquare } from 'lucide-react';
import { useVoiceSocket } from '@/hooks/useVoiceSocket';
import { TopicSelector } from '@/components/TopicSelector';
import { ModeSelector, type ConversationMode } from '@/components/ModeSelector';
import { getMissionHome, setMissionEntry } from '@/features/missionLearning/api';
import { useMissionLearningStore } from '@/features/missionLearning/store';
import { useMissionLearningAvailability } from '@/features/missionLearning/useMissionLearningAvailability';
import { useMissionRoleplayVoice } from '@/features/missionLearning/useMissionRoleplayVoice';
import { useGuidedLessonVoice } from '@/features/missionLearning/guided/useGuidedLessonVoice';
import { isGuidedTerminal, useGuidedLearningStore } from '@/features/missionLearning/guided/store';
import { getConversationTopic, type TopicId } from '@/lib/conversationTopics';
import { getConversationDifficulty, type DifficultyId } from '@/lib/conversationDifficulties';
import { TEXT_ONLY_TEST_MODE } from '@/lib/testMode';
import { isTranslatorWindowMessage, TRANSLATOR_WINDOW_MESSAGE } from '@/lib/translator';
// import { LearningExperience } from '@/features/learning/LearningExperience';
// import { buildKioskUrl } from '@/lib/kioskIdentity';

interface ControlPanelProps {
    onOpenSettings: () => void;
    onEndUsage?: () => Promise<void> | void;
    canEndUsage?: boolean;
    resumeUsageSignal?: number;
    openTopicSelectorEventId?: string | null;
    participantName?: string | null;
}

export function ControlPanel({
    onEndUsage,
    canEndUsage = false,
    resumeUsageSignal = 0,
    openTopicSelectorEventId = null,
    participantName = null,
}: ControlPanelProps) {
    const {
        connect,
        startListening,
        startConversation,
        resumeConversation,
        stopListening,
        pauseConversationForUsageEnd,
        isConnected,
        isSttReady,
        isRecording,
        sttProvider,
        clearHistory,
        prepareForReservationIntro,
        startLearningRoleplay,
        startGuidedLearningVoice,
        syncGuidedCapture,
        // 학습하기 UI를 다시 노출할 때 함께 복구합니다.
        // startLearningSession,
        // learningCommand,
        // beginLearningAttempt,
    } = useVoiceSocket();
    const isConnecting = useStore((state) => state.isConnecting);
    const activeSegmentId = useStore((state) => state.activeSegmentId);
    const topicSegments = useStore((state) => state.topicSegments);
    const conversationStartStatus = useStore((state) => state.conversationStartStatus);
    const conversationStartError = useStore((state) => state.conversationStartError);
    const reservationIntroEventId = useStore((state) => state.reservationIntroEventId);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isTopicSelectorOpen, setIsTopicSelectorOpen] = useState(false);
    const [entryStep, setEntryStep] = useState<'mode' | null>(null);
    const [modeError, setModeError] = useState<string | null>(null);
    const learningAvailability = useMissionLearningAvailability();
    const missionEntry = useMissionLearningStore((state) => state.entry);
    const guidedSnapshot = useGuidedLearningStore((state) => state.snapshot);
    const learningEntryActive = Boolean(missionEntry?.open || (guidedSnapshot && !isGuidedTerminal(guidedSnapshot)));
    const handledMissionEntrySeqRef = useRef(0);
    useMissionRoleplayVoice({
        enabled: learningAvailability === 'available',
        startLearningRoleplay,
        startListening,
        stopListening,
    });
    useGuidedLessonVoice({ enabled: learningAvailability === 'available', connected: isConnected,
        startVoice: startGuidedLearningVoice, syncCapture: syncGuidedCapture });

    // The avatar screen must stay connected while learning runs on the guide screen,
    // including after a reload in the middle of a mission.
    const connectForLearning = useCallback(() => {
        if (!isConnected) connect({ role: 'controller', startRecording: false });
    }, [connect, isConnected]);
    useEffect(() => {
        if (learningAvailability !== 'available' || isConnected) return;
        let cancelled = false;
        getMissionHome()
            .then((home) => {
                if (!cancelled && (home.entry?.open || home.activeSession)) connectForLearning();
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [connectForLearning, isConnected, learningAvailability]);
    const [isEndDialogOpen, setIsEndDialogOpen] = useState(false);
    // const [isLearningOpen, setIsLearningOpen] = useState(false);
    const [isEndingUsage, setIsEndingUsage] = useState(false);
    const safeEndChoiceRef = useRef<HTMLButtonElement | null>(null);
    const handledResumeSignalRef = useRef(0);
    const handledTopicSelectorEventRef = useRef<string | null>(null);
    const isTranslatorOpenRef = useRef(false);
    const resumeAfterTranslatorRef = useRef(false);
    const preparedReservationIntroRef = useRef<string | null>(null);
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

    // Mode choice comes first only when the build enables learning mode.
    const openConversationEntry = useCallback(() => {
        if (learningEntryActive) return;
        if (learningAvailability === 'disabled') {
            setIsTopicSelectorOpen(true);
        } else {
            setEntryStep('mode');
        }
    }, [learningAvailability, learningEntryActive]);

    const closeConversationEntry = useCallback(() => {
        setIsTopicSelectorOpen(false);
        setEntryStep(null);
    }, []);

    useEffect(() => {
        if (!learningEntryActive) return;
        // Retire the hidden entry too, so ending a lesson cannot resurrect its
        // old prompt unless the guide explicitly requests mode selection.
        const timer = window.setTimeout(closeConversationEntry, 0);
        return () => window.clearTimeout(timer);
    }, [closeConversationEntry, learningEntryActive]);

    const handleSelectMode = useCallback((mode: ConversationMode) => {
        setModeError(null);
        if (mode === 'learning') {
            if (learningAvailability !== 'available') return;
            // The learning screen itself runs on the guide display (/chat).
            if (isRecording) stopListening();
            setEntryStep(null);
            connectForLearning();
            setMissionEntry(true).catch(() => {
                setModeError('학습모드를 열지 못했어요. 잠시 후 다시 시도해 주세요.');
                setEntryStep('mode');
            });
            return;
        }
        setEntryStep(null);
        setIsTopicSelectorOpen(true);
    }, [connectForLearning, isRecording, learningAvailability, stopListening]);

    // "모드 다시 선택" on the guide display brings the mode choice back here.
    useEffect(() => {
        if (!missionEntry || missionEntry.seq <= handledMissionEntrySeqRef.current) return;
        // The first entry is the state replayed on connect, not a new request.
        const isReplay = handledMissionEntrySeqRef.current === 0;
        handledMissionEntrySeqRef.current = missionEntry.seq;
        if (isReplay || missionEntry.open || missionEntry.returnTo !== 'mode') return;
        const timer = window.setTimeout(() => setEntryStep('mode'), 0);
        return () => window.clearTimeout(timer);
    }, [missionEntry]);

    useEffect(() => useStore.subscribe((state, previousState) => {
        if (
            state.conversationStartStatus === 'opening'
            && previousState.conversationStartStatus !== 'opening'
        ) {
            closeConversationEntry();
        }
    }), [closeConversationEntry]);

    useEffect(() => {
        if (!reservationIntroEventId || preparedReservationIntroRef.current === reservationIntroEventId) {
            return;
        }
        preparedReservationIntroRef.current = reservationIntroEventId;
        closeConversationEntry();
        resumeAfterTranslatorRef.current = false;
        prepareForReservationIntro();
    }, [closeConversationEntry, prepareForReservationIntro, reservationIntroEventId]);

    useEffect(() => {
        if (resumeUsageSignal <= 0 || handledResumeSignalRef.current === resumeUsageSignal) return;
        handledResumeSignalRef.current = resumeUsageSignal;
        closeConversationEntry();
        if (activeSegment) {
            resumeConversation(activeSegment.segmentId);
        } else {
            openConversationEntry();
        }
    }, [activeSegment, closeConversationEntry, openConversationEntry, resumeConversation, resumeUsageSignal]);

    useEffect(() => {
        if (
            !openTopicSelectorEventId
            || handledTopicSelectorEventRef.current === openTopicSelectorEventId
        ) return;

        handledTopicSelectorEventRef.current = openTopicSelectorEventId;
        openConversationEntry();
    }, [openConversationEntry, openTopicSelectorEventId]);

    useEffect(() => {
        if (!isEndDialogOpen) return;
        const main = document.querySelector('main');
        const previousAriaHidden = main ? main.getAttribute('aria-hidden') : null;
        const previouslyInert = main?.hasAttribute('inert') ?? false;
        main?.setAttribute('inert', '');
        main?.setAttribute('aria-hidden', 'true');
        safeEndChoiceRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !isEndingUsage) setIsEndDialogOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            if (!previouslyInert) main?.removeAttribute('inert');
            if (previousAriaHidden === null) main?.removeAttribute('aria-hidden');
            else main?.setAttribute('aria-hidden', previousAriaHidden);
        };
    }, [isEndDialogOpen, isEndingUsage]);

    const confirmUsageEnd = useCallback(async () => {
        if (!onEndUsage || isEndingUsage) return;
        setIsEndingUsage(true);
        pauseConversationForUsageEnd();
        try {
            await onEndUsage();
            setIsEndDialogOpen(false);
        } finally {
            setIsEndingUsage(false);
        }
    }, [isEndingUsage, onEndUsage, pauseConversationForUsageEnd]);

    const handleToggleConnection = useCallback(() => {
        if (isProcessing || isConnecting) return;

        if (TEXT_ONLY_TEST_MODE) {
            openConversationEntry();
            return;
        }

        if (isConnected && isRecording) {
            setIsProcessing(true);
            stopListening();
            setTimeout(() => setIsProcessing(false), 500);
        } else if (isConnected && guidedSnapshot && !isGuidedTerminal(guidedSnapshot)) {
            startListening();
        } else {
            openConversationEntry();
        }
    }, [isConnected, isRecording, stopListening, startListening, guidedSnapshot, isProcessing, isConnecting, openConversationEntry]);

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
                closeConversationEntry();
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
    }, [closeConversationEntry, isRecording, startListening, stopListening]);

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
                        closeConversationEntry();
                        clearHistory();
                    }
                }}
                className="p-3 rounded-full border border-white/15 bg-white/5 text-red-200 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)] transition-all hover:bg-white/20 hover:text-red-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/90 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                aria-label="Reset Conversation"
                title="Reset conversation"
            >
                <Trash2 className="w-6 h-6" />
            </button>

            {canEndUsage && onEndUsage ? (
                <button
                    type="button"
                    onClick={() => setIsEndDialogOpen(true)}
                    className="p-3 rounded-full border border-white/15 bg-white/5 text-amber-100 transition-all hover:bg-amber-500/25 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                    aria-label="영어 프로그램 이용 종료"
                    title="이용 종료"
                >
                    <LogOut className="h-6 w-6" />
                </button>
            ) : null}

            {/* 학습하기 기능 임시 비노출
            <button
                type="button"
                onClick={() => {
                    if (isRecording) stopListening();
                    setIsTopicSelectorOpen(false);
                    setIsLearningOpen(true);
                }}
                className="p-3 rounded-full border border-white/15 bg-emerald-700/80 text-emerald-50 transition-all hover:bg-emerald-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                aria-label="말하기 학습 열기"
                title="말하기 학습"
            >
                <BookOpen className="h-6 w-6" />
            </button>
            */}

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
            isOpen={isTopicSelectorOpen && !learningEntryActive}
            participantName={participantName}
            currentTopicId={activeSegment?.topicId}
            currentDifficultyId={activeSegment?.difficultyId}
            isBusy={conversationStartStatus === 'preparing'}
            error={conversationStartError}
            onSelect={handleSelectTopic}
            onResume={activeSegment ? handleResume : undefined}
            onClose={() => setIsTopicSelectorOpen(false)}
        />
        <ModeSelector
            isOpen={entryStep === 'mode' && !learningEntryActive}
            learningAvailability={learningAvailability}
            participantName={participantName}
            error={modeError}
            onSelect={handleSelectMode}
            onClose={closeConversationEntry}
        />
        {/* 학습하기 기능 임시 비노출
        <LearningExperience
            role="controller"
            open={isLearningOpen}
            onClose={() => setIsLearningOpen(false)}
            onStart={startLearningSession}
            onCommand={learningCommand}
            onBeginAttempt={beginLearningAttempt}
        />
        */}
        {isEndDialogOpen && typeof document !== 'undefined' ? createPortal(
            <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-zinc-950/55 p-6 backdrop-blur-sm">
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="usage-end-title"
                    aria-describedby="usage-end-description"
                    className="w-full max-w-lg rounded-[2rem] border border-white/70 bg-[#fbf8f4] p-8 text-center shadow-[0_30px_110px_rgba(24,24,27,0.4)]"
                >
                    <h2 id="usage-end-title" className="text-3xl font-black text-zinc-900">이용을 종료할까요?</h2>
                    <p id="usage-end-description" className="mt-4 text-base font-semibold leading-7 text-zinc-600">
                        대화는 잠시 멈추고 종료 화면으로 이동합니다. 예약 시간이 남아 있다면 다시 이어서 이용할 수 있습니다.
                    </p>
                    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                        <button
                            ref={safeEndChoiceRef}
                            type="button"
                            disabled={isEndingUsage}
                            onClick={() => setIsEndDialogOpen(false)}
                            className="rounded-full border border-zinc-300 bg-white px-7 py-3 font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                            계속 대화하기
                        </button>
                        <button
                            type="button"
                            disabled={isEndingUsage}
                            onClick={() => void confirmUsageEnd()}
                            className="rounded-full bg-amber-600 px-7 py-3 font-black text-white hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60"
                        >
                            {isEndingUsage ? '종료 처리 중…' : '이용 종료하기'}
                        </button>
                    </div>
                </section>
            </div>,
            document.body,
        ) : null}
        </>
    );
}
