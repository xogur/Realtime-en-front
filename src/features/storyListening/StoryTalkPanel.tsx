'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, BookOpen, Loader2, Mic, MicOff, RotateCcw, Sparkles, Volume2 } from 'lucide-react';

import { useStore } from '@/stores/useStore';

/** Waiting longer than this for the AI connection is reported as a failure the learner can retry. */
const CONNECT_TIMEOUT_MS = 10_000;

const EXAMPLES = ['이 문장 주요 단어 알려줘', 'brave는 어떻게 발음해?', '방금 무슨 뜻이야?'];

export type StoryTalkStatus =
  | 'connecting' | 'offline' | 'error' | 'speaking' | 'thinking' | 'hearing' | 'listening' | 'preparing' | 'muted';

type StatusInput = {
  connected: boolean; stalled: boolean; error: string | null; playing: boolean; thinking: boolean;
  streaming: boolean; recording: boolean; ready: boolean; hearing: boolean;
};

/** One visible state, highest priority first, so the learner always knows whether to talk. */
export function storyTalkStatus(input: StatusInput): StoryTalkStatus {
  if (input.error) return 'error';
  if (!input.connected) return input.stalled ? 'offline' : 'connecting';
  if (input.playing) return 'speaking';
  if (input.thinking || input.streaming) return 'thinking';
  if (input.recording && input.ready) return input.hearing ? 'hearing' : 'listening';
  if (input.recording) return 'preparing';
  return 'muted';
}

const STATUS: Record<StoryTalkStatus, { label: string; hint: string; tone: string }> = {
  connecting: { label: 'AI 선생님 연결 중', hint: '잠깐만 기다려 주세요.', tone: 'bg-amber-100 text-amber-800' },
  offline: { label: 'AI 서버에 연결하지 못했어요', hint: '다시 시도를 눌러 주세요.', tone: 'bg-red-100 text-red-700' },
  error: { label: '문제가 생겼어요', hint: '', tone: 'bg-red-100 text-red-700' },
  speaking: { label: 'AI 선생님이 말하는 중', hint: '다 듣고 나서 말해 주세요.', tone: 'bg-sky-100 text-sky-800' },
  thinking: { label: '대답을 생각하는 중', hint: '조금만 기다려 주세요.', tone: 'bg-violet-100 text-violet-800' },
  hearing: { label: '듣고 있어요', hint: '말이 끝나면 잠깐 멈춰 주세요.', tone: 'bg-emerald-100 text-emerald-800' },
  listening: { label: '지금 말해 보세요', hint: '한국어로 물어봐도 돼요.', tone: 'bg-emerald-100 text-emerald-800' },
  preparing: { label: '마이크 준비 중', hint: '잠깐만 기다려 주세요.', tone: 'bg-amber-100 text-amber-800' },
  muted: { label: '마이크가 꺼져 있어요', hint: '마이크 버튼을 눌러 켜 주세요.', tone: 'bg-zinc-200 text-zinc-700' },
};

function StatusIcon({ status }: { status: StoryTalkStatus }) {
  if (status === 'connecting' || status === 'preparing' || status === 'thinking') return <Loader2 className="h-4 w-4 animate-spin" aria-hidden />;
  if (status === 'offline' || status === 'error') return <AlertCircle className="h-4 w-4" aria-hidden />;
  if (status === 'speaking') return <Volume2 className="h-4 w-4" aria-hidden />;
  if (status === 'muted') return <MicOff className="h-4 w-4" aria-hidden />;
  return (
    <span className="relative flex h-3 w-3" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
    </span>
  );
}

/** Bars that move only while speech is actually being recognised. */
function VoiceBars({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[0.6, 1, 0.75, 0.9].map((height, index) => (
        <motion.span key={index} className="w-1 rounded-full bg-current"
          animate={active && !reduceMotion ? { height: ['30%', `${height * 100}%`, '30%'] } : { height: '30%' }}
          transition={{ duration: 0.7, repeat: Infinity, delay: index * 0.12 }} />
      ))}
    </span>
  );
}

type StoryTalkPanelProps = {
  /** Shown under the title, e.g. "오디세우스의 모험 · 1장". */
  where: string | null;
  /** Only messages the server tagged with this talk are shown (earlier talks and free talk stay out). */
  talkId: string | null;
  error: string | null;
  onListen: () => void;
  onMute: () => void;
  onRetry: () => void;
  onFinish: () => void;
};

/**
 * Avatar-side story talk: the live conversation (learner speech and AI answers
 * as they stream) plus one clear microphone state and control.
 */
export function StoryTalkPanel({ where, talkId, error, onListen, onMute, onRetry, onFinish }: StoryTalkPanelProps) {
  const connected = useStore((state) => state.isConnected);
  const recording = useStore((state) => state.isRecording);
  const ready = useStore((state) => state.isSttReady);
  const playing = useStore((state) => state.isPlaying);
  const thinking = useStore((state) => state.isThinking);
  const allMessages = useStore((state) => state.messages);
  const live = useStore((state) => state.liveTranscript);
  const streaming = useStore((state) => state.partialMessage);
  const [stalled, setStalled] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (connected) return;
    const timer = window.setTimeout(() => setStalled(true), CONNECT_TIMEOUT_MS);
    return () => { window.clearTimeout(timer); setStalled(false); };
  }, [connected]);

  const messages = talkId ? allMessages.filter((message) => message.storyTalkId === talkId) : [];
  const status = storyTalkStatus({
    connected, stalled, error, playing, thinking, streaming: Boolean(streaming),
    recording, ready, hearing: Boolean(live),
  });
  const meta = STATUS[status];
  const micOn = recording;
  const canRetry = status === 'offline' || status === 'error';

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, live, streaming, thinking]);

  return (
    <section aria-label="이야기 대화" className="fixed bottom-6 right-6 top-6 z-50 flex w-[min(92vw,480px)] flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-[#fbf8f4]/92 shadow-[0_24px_80px_rgba(24,24,27,0.28)] backdrop-blur-xl">
      <header className="flex shrink-0 items-center gap-3 border-b border-[#483c2d]/10 px-5 py-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#2f4a3a] text-white">
          <BookOpen className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-zinc-900">이야기에 대해 물어보기</h2>
          {where ? <p className="truncate text-sm font-bold text-zinc-500">{where}</p> : null}
        </div>
      </header>

      <div role="status" aria-live="polite" className={`mx-4 mt-4 flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 ${meta.tone}`}>
        <StatusIcon status={status} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-black">{meta.label}</p>
          <p className="text-sm font-semibold opacity-80">{status === 'error' ? error : meta.hint}</p>
        </div>
        {status === 'hearing' || status === 'listening' ? <VoiceBars active={status === 'hearing'} /> : null}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !live && !streaming ? (
          <div className="rounded-2xl border border-dashed border-[#483c2d]/15 bg-white/50 p-4 text-sm font-bold text-zinc-500">
            <p className="flex items-center gap-1.5 text-zinc-700"><Sparkles className="h-4 w-4" aria-hidden />이렇게 물어볼 수 있어요</p>
            <ul className="mt-2 space-y-1">{EXAMPLES.map((example) => <li key={example}>“{example}”</li>)}</ul>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <div key={message.id ? `${message.role}:${message.id}` : `${message.role}:${index}`}
            data-story-talk-message={message.role}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[17px] leading-relaxed shadow-sm ${message.role === 'user'
              ? 'rounded-br-md bg-[#6b5a4a] font-semibold text-[#fdf8f4]'
              : 'rounded-bl-md border border-white/70 bg-white text-[#3d2f22]'}`}>
              {message.content}
            </p>
          </div>
        ))}
        <AnimatePresence>
          {live ? (
            <motion.div key="live" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-end">
              <p data-story-talk-live className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border-2 border-dashed border-[#6b5a4a]/40 bg-[#f3ebe3] px-4 py-3 text-[17px] font-semibold leading-relaxed text-[#6b5a4a]">
                {live}<span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-[#6b5a4a] align-middle" aria-hidden />
              </p>
            </motion.div>
          ) : null}
          {streaming ? (
            <motion.div key="streaming" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-start">
              <p data-story-talk-streaming className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-white/70 bg-white px-4 py-3 text-[17px] leading-relaxed text-[#3d2f22] shadow-sm">
                {streaming}<span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-[#3d2f22] align-middle" aria-hidden />
              </p>
            </motion.div>
          ) : thinking ? (
            <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start" aria-label="대답을 생각하는 중">
              <span className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-4 shadow-sm">
                {[0, 1, 2].map((dot) => <span key={dot} className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${dot * 150}ms` }} />)}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-[#483c2d]/10 px-4 py-4">
        {canRetry ? (
          <button type="button" onClick={onRetry} className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full bg-amber-600 px-5 text-lg font-black text-white transition hover:bg-amber-700 active:scale-[0.98]">
            <RotateCcw className="h-5 w-5" aria-hidden />다시 시도
          </button>
        ) : (
          <button type="button" onClick={micOn ? onMute : onListen} disabled={!connected} aria-pressed={micOn}
            className={`inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full px-5 text-lg font-black transition active:scale-[0.98] disabled:opacity-50 ${micOn
              ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-zinc-800 text-white hover:bg-zinc-700'}`}>
            {micOn ? <Mic className="h-5 w-5" aria-hidden /> : <MicOff className="h-5 w-5" aria-hidden />}
            {micOn ? '마이크 끄기' : '마이크 켜기'}
          </button>
        )}
        <button type="button" onClick={onFinish} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-5 text-lg font-black text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]">
          <BookOpen className="h-5 w-5" aria-hidden />이야기로
        </button>
      </footer>
    </section>
  );
}
