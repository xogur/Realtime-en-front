'use client';

import type { ReactNode } from 'react';
import {
  BadgeCheck,
  Loader2,
  MessageCircle,
  Palette,
  Plane,
  Play,
  School,
  Users,
  Utensils,
  X,
} from 'lucide-react';

import {
  CONVERSATION_TOPICS,
  getConversationTopic,
  type TopicId,
} from '@/lib/conversationTopics';

type TopicSelectorProps = {
  isOpen: boolean;
  currentTopicId?: TopicId | null;
  isBusy?: boolean;
  error?: string | null;
  onSelect: (topicId: TopicId) => void;
  onResume?: () => void;
  onClose: () => void;
};

const TOPIC_ICONS: Record<TopicId, ReactNode> = {
  travel: <Plane className="h-6 w-6" />,
  restaurant: <Utensils className="h-6 w-6" />,
  airport: <BadgeCheck className="h-6 w-6" />,
  hobby: <Palette className="h-6 w-6" />,
  school: <School className="h-6 w-6" />,
  family: <Users className="h-6 w-6" />,
  daily: <MessageCircle className="h-6 w-6" />,
};

export function TopicSelector({
  isOpen,
  currentTopicId,
  isBusy = false,
  error,
  onSelect,
  onResume,
  onClose,
}: TopicSelectorProps) {
  if (!isOpen) return null;

  const currentTopic = getConversationTopic(currentTopicId);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-selector-title"
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/60 bg-[#fffaf5]/95 p-6 shadow-2xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          className="absolute right-5 top-5 rounded-full p-2 text-zinc-500 transition hover:bg-zinc-200/70 hover:text-zinc-900 disabled:opacity-40"
          aria-label="주제 선택 닫기"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="pr-10">
          <p className="mb-2 text-sm font-bold text-blue-600">ENGLISH CONVERSATION</p>
          <h2 id="topic-selector-title" className="text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl">
            무슨 주제로 대화할까요?
          </h2>
          <p className="mt-2 text-sm font-medium text-zinc-600 sm:text-base">
            AI가 먼저 질문하거나 상황극을 시작해요.
          </p>
        </div>

        {currentTopic && onResume && (
          <button
            type="button"
            onClick={onResume}
            disabled={isBusy}
            className="mt-6 flex w-full items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-left transition hover:border-blue-300 hover:bg-blue-100 disabled:opacity-50"
          >
            <span>
              <span className="block text-xs font-bold text-blue-600">현재 주제</span>
              <span className="mt-1 block font-extrabold text-zinc-900">{currentTopic.label} 이어서 대화</span>
            </span>
            <Play className="h-5 w-5 text-blue-600" />
          </button>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CONVERSATION_TOPICS.map((topic) => (
            <button
              type="button"
              key={topic.id}
              onClick={() => onSelect(topic.id)}
              disabled={isBusy}
              className="group flex min-h-28 items-start gap-4 rounded-2xl border border-zinc-200 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-55"
            >
              <span className="rounded-xl bg-zinc-100 p-3 text-zinc-700 transition group-hover:bg-blue-100 group-hover:text-blue-700">
                {TOPIC_ICONS[topic.id]}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-extrabold text-zinc-900">{topic.label}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-500">
                    {topic.modeLabel}
                  </span>
                </span>
                <span className="mt-1 block text-sm font-medium leading-5 text-zinc-500">
                  {topic.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        {(isBusy || error) && (
          <div
            role="status"
            className={`mt-5 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
              error ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
            }`}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {error ?? '마이크와 AI 대화를 준비하고 있어요.'}
          </div>
        )}
      </section>
    </div>
  );
}
