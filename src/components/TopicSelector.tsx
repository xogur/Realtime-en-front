'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
  ChevronRight,
  Gauge,
  MessageCircle,
  Palette,
  Plane,
  Play,
  School,
  Sparkles,
  Users,
  Utensils,
  X,
} from 'lucide-react';

import {
  CONVERSATION_DIFFICULTIES,
  getConversationDifficulty,
  type DifficultyId,
} from '@/lib/conversationDifficulties';
import {
  CONVERSATION_TOPICS,
  getConversationTopic,
  type TopicId,
} from '@/lib/conversationTopics';
import { useVoiceTopicSelection } from '@/components/useVoiceTopicSelection';
import { OnboardingJourney } from '@/components/onboarding/OnboardingJourney';

type TopicSelectorProps = {
  isOpen: boolean;
  currentTopicId?: TopicId | null;
  currentDifficultyId?: DifficultyId | null;
  isBusy?: boolean;
  error?: string | null;
  participantName?: string | null;
  onSelect: (topicId: TopicId, difficultyId: DifficultyId) => void;
  onResume?: () => void;
  onClose: () => void;
};

const TOPIC_ICONS: Record<TopicId, ReactNode> = {
  travel: <Plane className="h-5 w-5" strokeWidth={1.8} />,
  restaurant: <Utensils className="h-5 w-5" strokeWidth={1.8} />,
  airport: <BadgeCheck className="h-5 w-5" strokeWidth={1.8} />,
  hobby: <Palette className="h-5 w-5" strokeWidth={1.8} />,
  school: <School className="h-5 w-5" strokeWidth={1.8} />,
  family: <Users className="h-5 w-5" strokeWidth={1.8} />,
  daily: <MessageCircle className="h-5 w-5" strokeWidth={1.8} />,
};

const DIFFICULTY_ICONS: Record<DifficultyId, ReactNode> = {
  beginner: <BookOpen className="h-6 w-6" strokeWidth={1.8} />,
  intermediate: <Gauge className="h-6 w-6" strokeWidth={1.8} />,
  advanced: <Sparkles className="h-6 w-6" strokeWidth={1.8} />,
};

const ROLEPLAY_TOPICS = CONVERSATION_TOPICS.filter(
  (topic) => topic.id === 'restaurant' || topic.id === 'airport',
);
const CONVERSATION_TOPICS_WITHOUT_ROLEPLAY = CONVERSATION_TOPICS.filter(
  (topic) => topic.id !== 'restaurant' && topic.id !== 'airport',
);

const TOPIC_SHORT_DESCRIPTIONS: Record<TopicId, string> = {
  travel: '기억에 남는 여행을 이야기해요.',
  restaurant: '직원과 손님으로 대화해요.',
  airport: '체크인 상황을 연습해요.',
  hobby: '좋아하는 취미를 이야기해요.',
  school: '학교생활을 이야기해요.',
  family: '가족 이야기를 나눠요.',
  daily: '주제 없이 편하게 대화해요.',
};

const interactiveCardClass =
  'group relative text-left outline-none transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#4f6b57] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-55';

export function TopicSelector({
  isOpen,
  currentTopicId,
  currentDifficultyId,
  isBusy = false,
  error,
  participantName,
  onSelect,
  onResume,
  onClose,
}: TopicSelectorProps) {
  const reduceMotion = useReducedMotion();
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId | null>(null);
  const [launchSelection, setLaunchSelection] = useState<{ topicId: TopicId; difficultyId: DifficultyId } | null>(null);
  const handleSelection = useCallback((topicId: TopicId, difficultyId: DifficultyId) => {
    setLaunchSelection({ topicId, difficultyId });
    onSelect(topicId, difficultyId);
  }, [onSelect]);
  const voiceSelection = useVoiceTopicSelection({
    enabled: isOpen && !isBusy,
    onDifficultySelect: setSelectedDifficulty,
    onSelect: handleSelection,
  });

  useEffect(() => {
    if (isOpen) return;
    const resetTimer = window.setTimeout(() => {
      setSelectedDifficulty(null);
      setLaunchSelection(null);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [isOpen]);

  useEffect(() => {
    if (!error || isBusy) return;
    const resetTimer = window.setTimeout(() => setLaunchSelection(null), 1100);
    return () => window.clearTimeout(resetTimer);
  }, [error, isBusy]);

  if (!isOpen) return null;

  const currentTopic = getConversationTopic(currentTopicId);
  const currentDifficulty = getConversationDifficulty(currentDifficultyId);
  const choosingTopic = selectedDifficulty !== null;
  const preparing = voiceSelection.phase === 'preparing-difficulty';
  const switchingToTopic = voiceSelection.phase === 'switching-to-topic';
  const selectedDifficultyDetail = getConversationDifficulty(selectedDifficulty);
  const launchTopic = getConversationTopic(launchSelection?.topicId);
  const launchDifficulty = getConversationDifficulty(launchSelection?.difficultyId);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#211d1a]/60 p-3 backdrop-blur-[9px] sm:p-5"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-20 top-[16%] h-72 w-72 rounded-full bg-[#6f8975]/25 blur-3xl"
          animate={reduceMotion ? undefined : { x: [0, 35, 0], y: [0, -20, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-28 right-[5%] h-80 w-80 rounded-full bg-[#8ba0b7]/20 blur-3xl"
          animate={reduceMotion ? undefined : { x: [0, -28, 0], y: [0, 24, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <motion.section
        layout
        initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.975 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-selector-title"
        className="relative max-h-[92dvh] w-full max-w-[860px] overflow-y-auto rounded-2xl border border-white/65 bg-[#fbf8f5]/95 shadow-[0_28px_80px_rgba(39,32,27,0.28)] sm:max-h-[95dvh]"
      >
        <button
          type="button"
          onClick={() => {
            void voiceSelection.stop();
            onClose();
          }}
          disabled={isBusy}
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-[#6b625a] transition-colors hover:bg-[#eee8e2] hover:text-[#27221e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] disabled:opacity-40 sm:right-6 sm:top-6"
          aria-label="대화 선택 닫기"
        >
          <X className="h-5 w-5" strokeWidth={1.8} />
        </button>

        <LayoutGroup id="conversation-setup">
        <div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
          <OnboardingJourney
            stage={launchSelection ? 'ready' : choosingTopic ? 'topic' : 'difficulty'}
            className="mb-7 max-w-[460px]"
          />

          <AnimatePresence mode="popLayout" initial={false}>
          {launchSelection ? (
            <motion.div
              key="launch"
              initial={false}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="flex min-h-[430px] flex-col items-center justify-center px-2 py-8 text-center"
            >
              <motion.div
                aria-hidden="true"
                className="relative grid h-32 w-32 place-items-center rounded-[2rem] bg-[#4f6b57] text-white shadow-[0_22px_50px_rgba(63,93,72,0.24)]"
                initial={reduceMotion ? false : { rotate: -5, scale: 0.84 }}
                animate={reduceMotion ? { rotate: 0, scale: 1 } : { rotate: [0, 3, 0], scale: [1, 1.04, 1] }}
                transition={{ duration: reduceMotion ? 0 : 1.4, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
              >
                <span className="scale-[2.2]">{launchSelection ? TOPIC_ICONS[launchSelection.topicId] : null}</span>
              </motion.div>
              <p className="mt-8 text-sm font-extrabold text-[#4f6b57]">
                {participantName ? `${participantName}님의 대화를 준비해요` : '선택한 대화를 준비해요'}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[#27221e] sm:text-4xl">
                {launchTopic?.label} 이야기를 열고 있어요
              </h2>
              <p className="mt-4 text-base font-semibold text-[#6b625a]">
                {launchDifficulty?.label} 표현으로 첫 질문을 만들고 있습니다.
              </p>
              <div aria-hidden="true" className="mt-8 flex items-center gap-2">
                {[0, 1, 2].map((item) => (
                  <motion.span
                    key={item}
                    className="h-2.5 w-2.5 rounded-full bg-[#4f6b57]"
                    animate={reduceMotion ? undefined : { y: [0, -8, 0], opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 0.8, repeat: Infinity, delay: item * 0.12, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              {error ? <p role="alert" className="mt-6 text-sm font-bold text-[#784638]">{error}</p> : null}
            </motion.div>
          ) : (
          <motion.div
            key={choosingTopic ? 'topic' : 'difficulty'}
            initial={reduceMotion ? false : { opacity: 0.86, x: choosingTopic ? 28 : -28, filter: 'blur(3px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0.35, x: choosingTopic ? -24 : 24, filter: 'blur(3px)' }}
            transition={{ duration: reduceMotion ? 0 : 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
          <header className="max-w-[620px] pr-12">
            <p className="text-sm font-bold text-[#4f6b57]">
              {choosingTopic
                ? `${selectedDifficultyDetail?.label ?? ''} 대화`
                : participantName
                  ? `${participantName}님, 이제 대화를 골라볼까요?`
                  : '대화 설정'}
            </p>
            <h2
              id="conversation-selector-title"
              className="mt-2 text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#27221e] sm:text-[2.15rem]"
            >
              {choosingTopic ? '어떤 이야기를 나눌까요?' : '원하는 대화 스타일을 선택하세요'}
            </h2>
            <p className="mt-2 max-w-[560px] text-sm font-medium leading-6 text-[#6b625a] sm:text-base">
              {choosingTopic
                ? 'AI가 선택한 주제에 맞는 첫 질문으로 자연스럽게 대화를 시작해요.'
                : '편하게 들을 수 있는 속도와 표현 수준을 기준으로 골라주세요.'}
            </p>
            <div
              role="status"
              aria-live="polite"
              className="mt-4 flex min-h-11 items-center gap-3 rounded-xl border border-[#6f8975]/25 bg-[#edf3ee] px-4 py-2.5 text-sm font-bold text-[#3f5d48]"
            >
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${voiceSelection.isRecording ? 'animate-pulse bg-emerald-500' : 'bg-amber-400'}`} />
              <span>
                {voiceSelection.error
                  ?? (preparing
                    ? '음성 선택을 준비하고 있어요.'
                    : switchingToTopic
                      ? '다음 선택을 준비하고 있어요. 화면을 터치해도 괜찮아요.'
                    : choosingTopic
                      ? '원하는 주제를 말하거나 화면을 터치해 주세요.'
                      : '초급, 중급, 고급 중 하나를 말하거나 화면을 터치해 주세요.')}
                {voiceSelection.interim ? ` · “${voiceSelection.interim}”` : ''}
              </span>
            </div>
          </header>

          {preparing && (
            <div className="mt-8 flex min-h-52 items-center justify-center rounded-2xl border border-[#483c2d]/10 bg-white/70 px-6 text-center">
              <div>
                <span aria-hidden="true" className="mx-auto block h-3 w-3 animate-pulse rounded-full bg-amber-400" />
                <p className="mt-4 text-lg font-extrabold text-[#3f3934]">잠시만 기다려 주세요</p>
                <p className="mt-1 text-sm font-medium text-[#766d65]">말씀하실 수 있도록 준비하고 있어요.</p>
              </div>
            </div>
          )}

          {!preparing && currentTopic && currentDifficulty && onResume && !choosingTopic && (
            <button
              type="button"
              onClick={() => {
                void voiceSelection.stop();
                onResume();
              }}
              disabled={isBusy}
              className={`${interactiveCardClass} mt-6 flex w-full items-center gap-4 rounded-2xl border border-[#7a907e]/35 bg-[#edf3ee] px-4 py-4 shadow-[0_8px_22px_rgba(62,82,67,0.08)] sm:px-5`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4f6b57] text-white">
                <Play className="h-5 w-5 fill-current" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-[#4f6b57]">이어 하던 대화</span>
                <span className="mt-0.5 block truncate text-base font-extrabold text-[#27221e]">
                  {currentTopic.label} / {currentDifficulty.label}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[#4f6b57]" strokeWidth={1.8} />
            </button>
          )}

          {!preparing && (!choosingTopic ? (
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CONVERSATION_DIFFICULTIES.map((difficulty) => (
                <button
                  type="button"
                  key={difficulty.id}
                  onClick={() => voiceSelection.selectDifficulty(difficulty.id)}
                  disabled={isBusy}
                  className={`${interactiveCardClass} flex min-h-[112px] flex-row items-center gap-4 rounded-2xl border border-[#483c2d]/12 bg-white p-4 shadow-[0_8px_24px_rgba(72,60,45,0.07)] hover:border-[#6f8975]/55 hover:bg-[#f8fbf8] hover:shadow-[0_12px_30px_rgba(72,60,45,0.11)] sm:min-h-[180px] sm:flex-col sm:items-start sm:gap-0 sm:p-5`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f0ece8] text-[#514a44] transition-colors duration-200 group-hover:bg-[#e2ebe4] group-hover:text-[#3f5d48] sm:h-12 sm:w-12">
                    {DIFFICULTY_ICONS[difficulty.id]}
                  </span>
                  <span className="min-w-0 flex-1 sm:mt-5 sm:w-full">
                    <span className="block text-xl font-black tracking-[-0.02em] text-[#27221e]">
                      {difficulty.label}
                    </span>
                    <span className="mt-1 block text-sm font-medium leading-5 text-[#6b625a] sm:mt-2">
                      {difficulty.description}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center justify-end text-[#4f6b57] sm:ml-0 sm:mt-auto sm:w-full sm:pt-4">
                    <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.8} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setSelectedDifficulty(null);
                  voiceSelection.returnToDifficulty();
                }}
                disabled={isBusy}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#5f5851] transition-colors hover:bg-[#eee8e2] hover:text-[#27221e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] disabled:opacity-45"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.8} /> 대화 스타일 다시 선택
              </button>

              <div className="mt-4 space-y-6">
                <section aria-labelledby="roleplay-topics-title">
                  <div className="mb-3">
                    <h3 id="roleplay-topics-title" className="text-sm font-extrabold text-[#27221e]">
                      상황 연습
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-[#7a7169]">실제 장소에서 쓸 수 있는 표현을 연습해요.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {ROLEPLAY_TOPICS.map((topic) => (
                      <TopicButton
                        key={topic.id}
                        topic={topic}
                        icon={TOPIC_ICONS[topic.id]}
                        isBusy={isBusy}
                        emphasis="roleplay"
                        onClick={() => voiceSelection.selectTopicByTouch(topic.id, selectedDifficulty)}
                      />
                    ))}
                  </div>
                </section>

                <section aria-labelledby="conversation-topics-title">
                  <div className="mb-3">
                    <h3 id="conversation-topics-title" className="text-sm font-extrabold text-[#27221e]">
                      자유 대화
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-[#7a7169]">익숙한 이야기로 부담 없이 대화를 이어가요.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {CONVERSATION_TOPICS_WITHOUT_ROLEPLAY.map((topic) => (
                      <TopicButton
                        key={topic.id}
                        topic={topic}
                        icon={TOPIC_ICONS[topic.id]}
                        isBusy={isBusy}
                        className={topic.id === 'daily' ? 'sm:col-span-2' : undefined}
                        onClick={() => voiceSelection.selectTopicByTouch(topic.id, selectedDifficulty)}
                      />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ))}

          {(isBusy || error) && (
            <div
              role="status"
              className={`mt-5 flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                error
                  ? 'border-[#b56b59]/25 bg-[#f8ebe7] text-[#784638]'
                  : 'border-[#6f8975]/25 bg-[#edf3ee] text-[#3f5d48]'
              }`}
            >
              {isBusy && <span aria-hidden="true" className="h-1.5 w-10 animate-pulse rounded-full bg-current opacity-55" />}
              {error ?? 'AI 대화를 준비하고 있어요.'}
            </div>
          )}
          </motion.div>
          )}
          </AnimatePresence>
        </div>
        </LayoutGroup>
      </motion.section>
    </motion.div>
  );
}

type TopicButtonProps = {
  topic: (typeof CONVERSATION_TOPICS)[number];
  icon: ReactNode;
  isBusy: boolean;
  onClick: () => void;
  className?: string;
  emphasis?: 'roleplay';
};

function TopicButton({ topic, icon, isBusy, onClick, className = '', emphasis }: TopicButtonProps) {
  const roleplayStyle = emphasis === 'roleplay';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy}
      className={`${interactiveCardClass} ${className} flex min-h-[92px] items-center gap-4 rounded-2xl border px-4 py-4 shadow-[0_6px_18px_rgba(72,60,45,0.06)] ${
        roleplayStyle
          ? 'border-[#738978]/28 bg-[#f0f5f1] hover:border-[#5f7b67]/55 hover:bg-[#eaf2ec]'
          : 'border-[#483c2d]/12 bg-white hover:border-[#6f8975]/45 hover:bg-[#f8fbf8]'
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
        roleplayStyle ? 'bg-[#dce8df] text-[#3f5d48]' : 'bg-[#f0ece8] text-[#514a44]'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-black tracking-[-0.015em] text-[#27221e]">{topic.label}</span>
        <span className="mt-1 block text-xs font-medium leading-5 text-[#6b625a]">{TOPIC_SHORT_DESCRIPTIONS[topic.id]}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#6f806f] transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={1.8} />
    </button>
  );
}
