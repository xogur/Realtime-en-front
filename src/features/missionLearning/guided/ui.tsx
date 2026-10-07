'use client';

import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Check, Compass, Headphones, Loader2, MessagesSquare, Mic, MicOff, PenLine, Trophy, TriangleAlert, Volume2, type LucideIcon } from 'lucide-react';
import { PHASES } from './types';

type Phase = typeof PHASES[number];

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34513c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf8f5]';
const pressable = 'transition-[transform,background-color,box-shadow,border-color,color] duration-200 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';

export const guidedButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#4f6b57]/20 bg-white px-4 py-3 text-base font-bold text-[#34513c] shadow-[0_1px_0_rgba(72,60,45,0.06),0_4px_14px_-6px_rgba(72,60,45,0.18)] hover:border-[#4f6b57]/40 hover:bg-[#f4f8f4] ${pressable} ${focusRing}`;
export const guidedPrimary = `inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#3d5e46] to-[#2c4634] px-6 py-3 text-base font-extrabold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_24px_-10px_rgba(44,70,52,0.75)] hover:from-[#46694f] hover:to-[#314d3a] ${pressable} ${focusRing}`;
export const guidedGhost = `inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-bold text-[#6b625a] hover:bg-[#efe9e3] hover:text-[#27221e] ${pressable} ${focusRing}`;
export const guidedCard = 'rounded-3xl border border-[#483c2d]/10 bg-white/90 shadow-[0_1px_0_rgba(72,60,45,0.04),0_18px_40px_-28px_rgba(72,60,45,0.45)]';

export const PHASE_META: Record<Phase, { label: string; icon: LucideIcon; hint: string }> = {
  DEMO: { label: '시범', icon: Headphones, hint: '먼저 들어 봐요' },
  REHEARSE: { label: '내 문장 만들기', icon: PenLine, hint: '내 말로 바꿔 봐요' },
  GUIDED: { label: '가이드 대화', icon: MessagesSquare, hint: '도움을 받으며 대화해요' },
  TRANSFER: { label: '새 상황 도전', icon: Compass, hint: '새 장면에서 혼자 말해요' },
  RECAP: { label: '변화 확인', icon: Trophy, hint: '오늘 해낸 걸 확인해요' },
};

/** Staggered entrance delay for `guided-rise`-style classes. */
export const stagger = (index: number, step = 70, base = 0): CSSProperties => ({ animationDelay: `${base + index * step}ms` });

export function GuidedStepper({ current }: { current: number | null }) {
  const progress = current === null ? 0 : (current / (PHASES.length - 1)) * 100;
  return <ol aria-label="수업 5단계" className="relative grid grid-cols-5 gap-1">
    <span aria-hidden className="absolute left-[10%] right-[10%] top-5 h-1 -translate-y-1/2 rounded-full bg-[#e8e0d7]">
      <span className="block h-full rounded-full bg-gradient-to-r from-[#7fa287] to-[#34513c] transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: `${progress}%` }} />
    </span>
    {PHASES.map((phase, i) => {
      const meta = PHASE_META[phase];
      const Icon = meta.icon;
      const active = current === i;
      const done = current !== null && i < current;
      return <li key={phase} aria-current={active ? 'step' : undefined} className="relative flex flex-col items-center gap-2 text-center">
        <span aria-hidden className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-black transition-colors duration-500 ${active ? 'border-transparent text-white' : done ? 'border-[#34513c] bg-[#34513c] text-white' : 'border-[#e2d9cf] bg-white text-[#a0968c]'}`}>
          {active && <motion.span layoutId="guided-step-active" transition={{ type: 'spring', stiffness: 420, damping: 32 }} className="guided-glow absolute inset-[-2px] rounded-full bg-gradient-to-br from-[#4f7a5a] to-[#2c4634]" />}
          <span className="relative">{done ? <Check className="h-4 w-4" strokeWidth={3} /> : active ? <Icon className="h-[18px] w-[18px]" /> : i + 1}</span>
        </span>
        <span className={`text-xs font-bold leading-tight transition-colors duration-300 sm:text-[13px] ${active ? 'text-[#2c4634]' : done ? 'text-[#4f6b57]' : 'text-[#a0968c]'}`}>
          <span className="sr-only">{i + 1}단계 </span>{meta.label}
        </span>
      </li>;
    })}
  </ol>;
}

export type VoiceTone = 'listening' | 'hearing' | 'speaking' | 'thinking' | 'waiting' | 'idle' | 'done' | 'stopped' | 'error' | 'recovery';

const toneStyle: Record<VoiceTone, { core: string; ring: string; icon: LucideIcon; spin?: boolean }> = {
  listening: { core: 'from-[#4f7a5a] to-[#2c4634] text-white', ring: 'bg-[#4f7a5a]', icon: Mic },
  hearing: { core: 'from-[#5c8a66] to-[#2c4634] text-white', ring: 'bg-[#5c8a66]', icon: Mic },
  speaking: { core: 'from-[#f0c16a] to-[#d99a2b] text-[#3f2c0a]', ring: 'bg-[#f0c16a]', icon: Volume2 },
  thinking: { core: 'from-[#8aa894] to-[#4f6b57] text-white', ring: '', icon: Loader2, spin: true },
  waiting: { core: 'from-[#ece5dd] to-[#ddd3c8] text-[#8a8077]', ring: '', icon: Loader2, spin: true },
  done: { core: 'from-[#e7efe8] to-[#cfe2d3] text-[#34513c]', ring: '', icon: Check },
  idle: { core: 'from-[#f4ede4] to-[#e6dccf] text-[#6b625a]', ring: '', icon: Headphones },
  stopped: { core: 'from-[#ece5dd] to-[#ddd3c8] text-[#6b625a]', ring: '', icon: MicOff },
  error: { core: 'from-[#f3b3a3] to-[#c8553d] text-white', ring: '', icon: MicOff },
  recovery: { core: 'from-[#f7d68f] to-[#e0a43a] text-[#3f2c0a]', ring: '', icon: TriangleAlert },
};

/** Big status orb next to the textual status; purely decorative. */
export function VoiceOrb({ tone }: { tone: VoiceTone }) {
  const style = toneStyle[tone];
  const Icon = style.icon;
  const pulsing = tone === 'listening' || tone === 'hearing' || tone === 'speaking';
  return <span aria-hidden className="relative flex h-16 w-16 shrink-0 items-center justify-center">
    {pulsing && <>
      <span className={`guided-ring absolute inset-0 rounded-full ${style.ring}`} />
      <span className={`guided-ring absolute inset-0 rounded-full ${style.ring}`} style={{ animationDelay: '0.9s' }} />
    </>}
    <span key={tone} className={`guided-pop relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br shadow-[inset_0_2px_0_rgba(255,255,255,0.25),0_12px_26px_-12px_rgba(44,70,52,0.7)] ${style.core} ${pulsing ? 'guided-breathe' : ''}`}>
      <Icon className={`h-7 w-7 ${style.spin ? 'animate-spin' : ''}`} />
    </span>
  </span>;
}

export function Equalizer({ bars = 5, className = 'bg-current', active = true }: { bars?: number; className?: string; active?: boolean }) {
  return <span aria-hidden className="inline-flex h-5 items-end gap-[3px]">
    {Array.from({ length: bars }, (_, i) => <span key={i} className={`w-[3px] rounded-full ${className} ${active ? 'guided-eq' : ''}`} style={{ height: '100%', animationDelay: `${(i * 137) % 600}ms`, transform: active ? undefined : 'scaleY(0.3)', transformOrigin: 'bottom' }} />)}
  </span>;
}

export function ThinkingDots() {
  return <span aria-hidden className="inline-flex items-center gap-1">
    {[0, 1, 2].map(i => <span key={i} className="guided-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 160}ms` }} />)}
  </span>;
}

const confettiColors = ['#34513c', '#7fa287', '#f0c16a', '#e98b6d', '#9cc5a9', '#d99a2b'];

/** Deterministic burst so renders are stable across hydration and tests. */
export function Confetti({ pieces = 26, spread = 220 }: { pieces?: number; spread?: number }) {
  return <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
    {Array.from({ length: pieces }, (_, i) => {
      const angle = (i / pieces) * Math.PI * 2 + (i % 3) * 0.21;
      const distance = spread * (0.55 + ((i * 37) % 45) / 100);
      const style = {
        '--gx': `${Math.cos(angle) * distance}px`, '--gy': `${Math.sin(angle) * distance * 0.75 + 40}px`, '--gr': `${(i * 67) % 540 - 270}deg`,
        animationDelay: `${(i * 23) % 180}ms`, background: confettiColors[i % confettiColors.length],
      } as CSSProperties;
      return <span key={i} className={`guided-confetti absolute block ${i % 3 === 0 ? 'h-2 w-2 rounded-full' : 'h-3 w-1.5 rounded-[2px]'}`} style={style} />;
    })}
  </span>;
}

export function SparkleBurst({ count = 10 }: { count?: number }) {
  return <span aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
    {Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const style = { '--gx': `${Math.cos(angle) * 46}px`, '--gy': `${Math.sin(angle) * 34}px`, left: '2.25rem', top: '2rem', animationDelay: `${120 + i * 25}ms`, background: confettiColors[(i + 2) % confettiColors.length] } as CSSProperties;
      return <span key={i} className="guided-sparkle absolute block h-1.5 w-1.5 rounded-full" style={style} />;
    })}
  </span>;
}
