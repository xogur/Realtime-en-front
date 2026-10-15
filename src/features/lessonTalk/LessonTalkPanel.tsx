'use client';

import { HelpCircle, Loader2, LogOut, Mic, Pause, Play, RotateCcw } from 'lucide-react';

import type { useLessonTalk } from './useLessonTalk';

/*
 * Lesson talk on the avatar screen. The avatar stays the centre: a small lesson
 * chip on top and, at the bottom, what the avatar just said (English with the
 * Korean meaning when the level allows it), one status line, and three controls
 * (pause, help, exit). Choice cards appear only when the avatar offers them.
 */

type LessonTalk = ReturnType<typeof useLessonTalk>;

export const TOPIC_LABELS: Record<string, string> = {
  daily: '일상', travel: '여행', restaurant: '식당', airport: '공항', hobby: '취미', school: '학교', family: '가족',
};

const glass = 'rounded-3xl border border-white/25 bg-zinc-950/55 text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl';
const roundButton = 'flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white shadow-lg backdrop-blur-md transition hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-40';
const pill = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-6 py-3 text-lg font-black transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-50';

const STATUS_TEXT: Record<string, string> = {
  starting: 'AI 선생님이 준비하고 있어요',
  speaking: 'AI 선생님 말을 들어 보세요',
  listening: '이제 말해 보세요',
  hearing: '잘 듣고 있어요',
  thinking: '생각하는 중이에요…',
  ending: 'AI 선생님 말을 들어 보세요',
};

export function LessonTalkPanel({ lesson, onExit }: { lesson: LessonTalk; onExit: () => void }) {
  const { turn, status, paused, heard, answered, notice, canAnswer } = lesson;
  const progress = turn?.progress ?? null;
  const topic = progress ? TOPIC_LABELS[progress.topicId] ?? '' : '';
  const chip = progress ? `${topic ? `${topic} · ` : ''}${progress.titleKo}` : '학습하기';
  // The avatar's current English line (the role line, else the model) and its Korean meaning.
  const shown = turn ? [...turn.lines].reverse().find((line) => line.lang === 'en' && line.role !== 'coach') : undefined;
  const lineEn = turn?.display?.en && turn.stage !== 'warmup' ? turn.display.en : shown?.text ?? '';
  const lineKo = shown?.subtitleKo ?? (turn?.stage === 'turn' || turn?.stage === 'warmup' ? turn.display?.ko ?? '' : '');
  const display = turn?.stage === 'turn' ? turn.display : null;
  // Setup and wrap-up questions are Korean only: show the avatar's last Korean line instead.
  const questionKo = !lineEn && turn ? turn.lines.filter((line) => line.lang === 'ko').map((line) => line.text).join(' ') : '';
  const choices = turn?.expect.kind === 'choice' ? turn.expect.choices ?? [] : turn?.expect.choices ?? [];
  const listening = status === 'listening' || status === 'hearing';
  // Role-play: the big English line is the avatar's; learners read it aloud when that is unclear.
  const rolePlay = turn?.stage === 'turn' && Boolean(lineEn);
  const answerHelp = Boolean(display && choices.length === 0 && !display.model && (display.guideKo || display.frame || display.words));

  return (
    <>
      <div className="fixed left-1/2 top-4 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-zinc-950/55 px-4 py-2 text-base font-black text-white backdrop-blur-md">{chip}</span>
        {progress && progress.turnTotal > 0 && turn?.stage === 'turn' ? (
          <span aria-label={`${progress.turnTotal}개 중 ${progress.turnIndex + 1}번째 대화`} className="flex gap-1 rounded-full bg-zinc-950/55 px-3 py-2">
            {Array.from({ length: progress.turnTotal }, (_, index) => (
              <span key={index} className={`h-2.5 w-2.5 rounded-full ${index < progress.turnIndex ? 'bg-emerald-300' : index === progress.turnIndex ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </span>
        ) : null}
        {paused ? <span className="rounded-full bg-white/85 px-3 py-1.5 text-sm font-black text-zinc-800">잠깐 멈춤</span> : null}
      </div>

      <div className="fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-4 px-4">
        {status === 'error' ? (
          <section role="alert" className={`${glass} w-full max-w-2xl p-6 text-center`}>
            <p className="text-xl font-black">{notice ?? '학습을 이어가지 못했어요.'}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button type="button" className={`${pill} border border-white/40 bg-white/10 text-white hover:bg-white/20`} onClick={onExit}>
                <LogOut className="h-5 w-5" aria-hidden />나가기
              </button>
              <button type="button" className={`${pill} bg-white text-zinc-900 hover:bg-zinc-100`} onClick={lesson.retry}>
                <RotateCcw className="h-5 w-5" aria-hidden />다시 시도
              </button>
            </div>
          </section>
        ) : (
          <section aria-live="polite" className={`${glass} w-full max-w-2xl p-6`}>
            {rolePlay ? <p className="mb-1 text-base font-black text-white/70">AI 선생님이 하는 말</p> : null}
            {lineEn ? <p lang="en" className="text-3xl font-black leading-snug">{lineEn}</p> : null}
            {questionKo ? <p lang="ko" className="text-2xl font-black leading-snug">{questionKo}</p> : null}
            {lineKo ? <p lang="ko" className="mt-1 text-lg font-bold leading-snug text-white/80">{lineKo}</p> : null}
            {rolePlay && answerHelp ? (
              <p className="mt-4 border-t border-white/15 pt-3 text-base font-black text-emerald-200">내 대답 · 위 말에 이렇게 대답해요</p>
            ) : null}
            {display?.guideKo && choices.length === 0 && !display.model ? (
              <div className={`${rolePlay && answerHelp ? 'mt-2' : 'mt-3'} rounded-2xl bg-sky-300/20 px-4 py-2`}>
                <p className="text-base font-bold text-sky-200">이렇게 말해 봐요</p>
                <p lang="ko" className="text-xl font-black text-sky-50">{display.guideKo}</p>
              </div>
            ) : null}
            {display?.frame ? (
              <div className="mt-3 rounded-2xl bg-amber-300/20 px-4 py-2">
                <p lang="en" className="text-xl font-black text-amber-100">{display.frame}</p>
                {display.howKo ? <p className="mt-0.5 text-base font-bold text-amber-50/85">{display.howKo}</p> : null}
              </div>
            ) : null}
            {display?.words && choices.length === 0 ? (
              <ul aria-label="쓸 수 있는 단어" className="mt-3 flex flex-wrap gap-2">
                {display.words.map((word) => (
                  <li key={word.en} className="rounded-full bg-white/15 px-3 py-1 text-base font-bold">
                    <span lang="en" className="font-black">{word.en}</span><span className="ml-1.5 text-white/75">{word.ko}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {turn?.display?.model && turn.stage === 'turn' && choices.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-emerald-300/20 px-4 py-2 text-xl font-black text-emerald-50">
                <span className="mr-2 text-base text-emerald-200">따라 해 봐요</span><span lang="en">{turn.display.model}</span>
              </p>
            ) : null}

            {choices.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {choices.map((choice, index) => (
                  <button key={choice.id} type="button" onClick={() => lesson.choose(choice.id)} disabled={!canAnswer}
                    className="min-h-14 rounded-2xl bg-white px-5 py-3 text-left text-xl font-black text-zinc-900 transition hover:bg-zinc-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-60">
                    <span className="mr-2 text-zinc-500">{index + 1}.</span>{choice.label}
                  </button>
                ))}
              </div>
            ) : null}

            <p className="mt-4 flex items-center gap-2 text-base font-bold text-white/85">
              {listening ? <Mic className="h-5 w-5 animate-pulse text-emerald-300" aria-hidden /> : <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              {paused ? '잠깐 멈췄어요' : STATUS_TEXT[status]}
            </p>
            {status === 'hearing' && heard ? (
              <p className="mt-3 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold">“{heard}”</p>
            ) : status === 'thinking' && answered ? (
              <p className="mt-3 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold">
                “{answered}”<span className="ml-1 text-base font-bold text-white/70">라고 들었어요</span>
              </p>
            ) : null}
          </section>
        )}

        <div className="flex items-center justify-center gap-3">
          <button type="button" className={roundButton} onClick={lesson.togglePause} disabled={status === 'error' || status === 'ending'}
            aria-label={paused ? '학습 계속' : '잠깐 멈추기'}>
            {paused ? <Play className="ml-1 h-8 w-8" aria-hidden /> : <Pause className="h-8 w-8" aria-hidden />}
          </button>
          <button type="button" className={roundButton} onClick={lesson.help} disabled={!canAnswer} aria-label="도움 받기">
            <HelpCircle className="h-8 w-8" aria-hidden />
          </button>
          <button type="button" className={roundButton} onClick={onExit} aria-label="학습 나가기">
            <LogOut className="h-7 w-7" aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}
