'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';

export type OnboardingJourneyStage = 'name' | 'difficulty' | 'topic' | 'ready';

const STAGES: Array<{ id: Exclude<OnboardingJourneyStage, 'ready'>; label: string }> = [
  { id: 'name', label: '이름' },
  { id: 'difficulty', label: '대화 스타일' },
  { id: 'topic', label: '이야기' },
];

const STAGE_INDEX: Record<OnboardingJourneyStage, number> = {
  name: 0,
  difficulty: 1,
  topic: 2,
  ready: 3,
};

type Props = {
  stage: OnboardingJourneyStage;
  className?: string;
};

export function OnboardingJourney({ stage, className = '' }: Props) {
  const reduceMotion = useReducedMotion();
  const currentIndex = STAGE_INDEX[stage];

  return (
    <nav aria-label="대화 시작 준비" className={`mx-auto w-full max-w-md ${className}`}>
      <ol className="grid grid-cols-3 gap-2">
        {STAGES.map((item, index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;

          return (
            <li key={item.id} className="relative min-w-0">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1/2 top-4 h-px w-[calc(100%-0.75rem)] -translate-y-1/2 bg-[#d8d0c8]"
                >
                  <motion.span
                    className="block h-full origin-left bg-[#4f6b57]"
                    initial={false}
                    animate={{ scaleX: complete || current ? 1 : 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
              ) : null}
              <div className="relative flex flex-col items-center gap-2 text-center">
                <motion.span
                  aria-hidden="true"
                  initial={false}
                  animate={{
                    scale: current && !reduceMotion ? [1, 1.12, 1] : 1,
                    backgroundColor: complete || current ? '#4f6b57' : '#e6dfd8',
                  }}
                  transition={{ duration: reduceMotion ? 0 : 0.46, ease: [0.16, 1, 0.3, 1] }}
                  className={`relative z-10 grid h-8 w-8 place-items-center rounded-xl text-xs font-black ${
                    complete || current ? 'text-white' : 'text-[#81786f]'
                  }`}
                >
                  {complete ? <Check className="h-4 w-4" strokeWidth={2.4} /> : index + 1}
                </motion.span>
                <span className={`truncate text-xs font-extrabold ${current ? 'text-[#27221e]' : complete ? 'text-[#4f6b57]' : 'text-[#928980]'}`}>
                  {item.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
