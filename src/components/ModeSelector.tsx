'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { GraduationCap, Hand, MessageCircle, Mic, Volume2, X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { MissionLearningAvailability } from '@/features/missionLearning/useMissionLearningAvailability';
import { useVoiceModeSelection } from './useVoiceModeSelection';

export type ConversationMode = 'free_talk' | 'learning';

type ModeSelectorProps = {
  isOpen: boolean;
  learningAvailability: MissionLearningAvailability;
  participantName?: string | null;
  error?: string | null;
  onSelect: (mode: ConversationMode) => void;
  onClose: () => void;
};

const cardClass =
  'group relative flex min-h-[200px] flex-col items-start rounded-2xl border p-5 text-left shadow-[0_8px_24px_rgba(72,60,45,0.07)] outline-none transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#4f6b57] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 sm:min-h-[240px] sm:p-6';

const LEARNING_STATUS: Record<Exclude<MissionLearningAvailability, 'available' | 'disabled'>, string> = {
  checking: '학습모드를 확인하고 있어요.',
  unavailable: '지금은 학습모드를 사용할 수 없어요.',
};

export function ModeSelector({
  isOpen,
  learningAvailability,
  participantName,
  error,
  onSelect,
  onClose,
}: ModeSelectorProps) {
  const reduceMotion = useReducedMotion();
  const learningReady = learningAvailability === 'available';
  const voice = useVoiceModeSelection({ enabled: isOpen, learningReady, onSelect });
  if (!isOpen) return null;

  const learningStatus = learningReady || learningAvailability === 'disabled'
    ? null
    : LEARNING_STATUS[learningAvailability];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#211d1a]/60 p-3 backdrop-blur-[9px] sm:p-5"
    >
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.975 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-selector-title"
        className="relative max-h-[92dvh] w-full max-w-[860px] overflow-y-auto rounded-2xl border border-white/65 bg-[#fbf8f5]/95 px-5 pb-6 pt-6 shadow-[0_28px_80px_rgba(39,32,27,0.28)] sm:max-h-[95dvh] sm:px-8 sm:pb-8 sm:pt-8"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-xl text-[#6b625a] transition-colors hover:bg-[#eee8e2] hover:text-[#27221e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6b57] sm:right-6 sm:top-6"
          aria-label="모드 선택 닫기"
        >
          <X className="h-5 w-5" strokeWidth={1.8} />
        </button>

        <header className="max-w-[620px] pr-12">
          <p className="text-sm font-bold text-[#4f6b57]">
            {participantName ? `${participantName}님, 어떻게 시작할까요?` : '시작 방법'}
          </p>
          <h2
            id="mode-selector-title"
            className="mt-2 text-[1.75rem] font-black leading-tight tracking-[-0.035em] text-[#27221e] sm:text-[2.15rem]"
          >
            원하는 모드를 선택하세요
          </h2>
        </header>

        <div role="status" className="mt-5 flex items-center gap-2 text-sm font-bold text-[#4f6b57]">
          {voice.status === 'prompting' ? <Volume2 className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          <span>{voice.status === 'listening' ? '“프리토킹” 또는 “학습모드”라고 말씀해 주세요.'
            : voice.status === 'unavailable' ? '화면을 터치해 선택해 주세요.'
            : voice.status === 'selected' ? '선택한 모드를 열고 있어요.' : '음성 선택을 준비하고 있어요.'}</span>
        </div>
        {voice.interim ? <p className="mt-2 text-sm text-[#6b625a]">인식 중: “{voice.interim}”</p> : null}

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModeCard
            label="프리토킹"
            description="원하는 주제로 아바타와 자유롭게 대화해요."
            icon={<MessageCircle className="h-7 w-7" strokeWidth={1.8} />}
            onClick={() => void voice.select('free_talk')}
            number={1}
          />
          <ModeCard
            label="학습모드"
            description="상황 미션으로 표현을 배우고 바로 써봐요."
            icon={<GraduationCap className="h-7 w-7" strokeWidth={1.8} />}
            emphasis
            disabled={!learningReady}
            status={learningStatus}
            onClick={() => void voice.select('learning')}
            number={2}
          />
        </div>
        {error ? <p role="alert" className="mt-4 text-sm font-bold text-[#784638]">{error}</p> : null}
        {voice.error ? <p role="alert" className="mt-4 text-sm font-bold text-[#784638]">{voice.error}</p> : null}
      </motion.section>
    </motion.div>
  );
}

type ModeCardProps = {
  label: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  emphasis?: boolean;
  disabled?: boolean;
  status?: string | null;
  number: number;
};

function ModeCard({ label, description, icon, onClick, emphasis = false, disabled = false, status, number }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${label}. ${description}${status ? ` ${status}` : ''}`}
      className={`${cardClass} ${emphasis
        ? 'border-[#738978]/28 bg-[#f0f5f1] hover:border-[#5f7b67]/55 hover:bg-[#eaf2ec]'
        : 'border-[#483c2d]/12 bg-white hover:border-[#6f8975]/55 hover:bg-[#f8fbf8]'}`}
    >
      <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${emphasis
        ? 'bg-[#dce8df] text-[#3f5d48]'
        : 'bg-[#f0ece8] text-[#514a44]'}`}
      >
        {icon}
      </span>
      <span className="mt-5 block text-2xl font-black tracking-[-0.02em] text-[#27221e]">{label}</span>
      <span className="mt-2 block text-base font-medium leading-6 text-[#6b625a]">{description}</span>
      {status ? (
        <span role="status" className="mt-3 block text-sm font-bold text-[#784638]">{status}</span>
      ) : null}
      <span className="mt-auto flex w-full justify-end pt-4 text-[#4f6b57]">
        <span className="mr-auto text-sm font-bold">{number}번</span>
        <Hand aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
      </span>
    </button>
  );
}
