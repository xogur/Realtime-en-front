'use client';

import { useEffect, useState, type ReactNode } from 'react';
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

type TopicSelectorProps = {
  isOpen: boolean;
  currentTopicId?: TopicId | null;
  currentDifficultyId?: DifficultyId | null;
  isBusy?: boolean;
  error?: string | null;
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
  onSelect,
  onResume,
  onClose,
}: TopicSelectorProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyId | null>(null);

  useEffect(() => {
    if (!isOpen) setSelectedDifficulty(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentTopic = getConversationTopic(currentTopicId);
  const currentDifficulty = getConversationDifficulty(currentDifficultyId);
  const choosingTopic = selectedDifficulty !== null;
  const selectedDifficultyDetail = getConversationDifficulty(selectedDifficulty);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#211d1a]/60 p-3 backdrop-blur-[6px] sm:p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-selector-title"
        className="relative max-h-[92dvh] w-full max-w-[860px] overflow-y-auto rounded-2xl border border-[#483c2d]/15 bg-[#fbf8f5] shadow-[0_28px_80px_rgba(39,32,27,0.28)] sm:max-h-[95dvh]"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-[#6b625a] transition-colors hover:bg-[#eee8e2] hover:text-[#27221e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] disabled:opacity-40 sm:right-6 sm:top-6"
          aria-label="대화 선택 닫기"
        >
          <X className="h-5 w-5" strokeWidth={1.8} />
        </button>

        <div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
          <header className="max-w-[620px] pr-12">
            <p className="text-sm font-bold text-[#4f6b57]">
              {choosingTopic ? `${selectedDifficultyDetail?.label ?? ''} 대화` : '대화 설정'}
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
          </header>

          {currentTopic && currentDifficulty && onResume && !choosingTopic && (
            <button
              type="button"
              onClick={onResume}
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

          {!choosingTopic ? (
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CONVERSATION_DIFFICULTIES.map((difficulty) => (
                <button
                  type="button"
                  key={difficulty.id}
                  onClick={() => setSelectedDifficulty(difficulty.id)}
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
                onClick={() => setSelectedDifficulty(null)}
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
                        onClick={() => onSelect(topic.id, selectedDifficulty)}
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
                        onClick={() => onSelect(topic.id, selectedDifficulty)}
                      />
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

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
        </div>
      </section>
    </div>
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
