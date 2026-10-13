'use client';

import { BookOpen, Check, HelpCircle, Loader2, LogOut, Mic, Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward } from 'lucide-react';

import { STORIES } from './stories';
import { storyMinutes } from './storyAudio';
import type { useStoryAvatar } from './useStoryAvatar';

/*
 * Story controls on the avatar screen. The avatar stays the centre of the
 * screen: only a small position chip on top and, at the bottom, subtitles,
 * the current question and two controls (pause, exit). No interception: the
 * learner cannot talk to the avatar while the story plays.
 */

type StoryAvatar = ReturnType<typeof useStoryAvatar>;

const glass = 'rounded-3xl border border-white/25 bg-zinc-950/55 text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl';
const SEEK_SECONDS = 2;
const roundButton = 'flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white shadow-lg backdrop-blur-md transition hover:bg-white/25 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-40';
const pill = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-6 py-3 text-lg font-black transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-50';
const primaryPill = `${pill} bg-white text-zinc-900 hover:bg-zinc-100`;
const ghostPill = `${pill} border border-white/40 bg-white/10 text-white hover:bg-white/20`;

const toggleChip = 'inline-flex min-h-12 items-center gap-1.5 rounded-full border px-5 py-2 text-base font-black transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70';
const REVIEW_OPTIONS = [
  { key: 'slow', label: '천천히' },
  { key: 'english', label: '영어 자막' },
  { key: 'korean', label: '한국어 해석' },
] as const;

function supportLabel(support: StoryAvatar['support']): string | null {
  const parts = [support.speed === 'slow' ? '천천히' : null, support.english ? '영어 자막' : null, support.korean ? '한국어 해석' : null]
    .filter(Boolean);
  if (parts.length === 1 && support.speed === 'slow') return '천천히 다시 듣기';
  return parts.length ? parts.join(' · ') : null;
}

const STATUS_TEXT: Record<string, string> = {
  starting: 'AI 선생님이 질문을 준비하고 있어요',
  speaking: 'AI 선생님이 묻고 있어요',
  listening: '한국어로 편하게 말해 보세요',
  hearing: '잘 듣고 있어요',
  thinking: '생각하는 중이에요…',
  choices: '맞는 것을 누르거나 번호를 말해 보세요',
  deciding: 'AI 선생님 말을 들어 보세요',
};

export function StoryAvatarPanel({ avatar, onExit }: { avatar: StoryAvatar; onExit: () => void }) {
  const { story, chapter, chapterIndex, phase, paused, support, sentence, player, check } = avatar;

  if (!story || phase === 'picker') {
    return (
      <div className="fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
        <section aria-labelledby="story-picker-title" className={`${glass} w-full max-w-3xl p-6`}>
          <h2 id="story-picker-title" className="text-center text-2xl font-black">어떤 이야기를 들을까요?</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {Object.values(STORIES).filter(({ story: item }) => item.narration === 'recorded').map(({ story: item }) => (
              <button key={item.id} type="button" onClick={() => avatar.pick(item.id)}
                className="flex min-h-24 items-center gap-4 rounded-2xl bg-white px-5 py-4 text-left text-zinc-900 transition hover:bg-zinc-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70">
                <BookOpen className="h-9 w-9 shrink-0 text-amber-600" aria-hidden />
                <span>
                  <span className="block text-xl font-black">{item.titleKo}</span>
                  <span className="block text-sm font-bold text-zinc-500">{item.levelKo} · 약 {storyMinutes(item)}분 · {item.chapters.length}장</span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 flex justify-center">
            <button type="button" className={ghostPill} onClick={onExit}><LogOut className="h-5 w-5" aria-hidden />모드 다시 선택</button>
          </div>
        </section>
      </div>
    );
  }

  const chip = `${story.titleKo} · ${chapterIndex + 1}장${chapter ? ` ${chapter.titleKo}` : ''}`;
  const supportText = supportLabel(support);
  const canPause = phase === 'listening' || (phase === 'checking' && check.status !== 'error');
  const showPlay = paused || (phase === 'listening' && (player.blocked || Boolean(player.error)));

  return (
    <>
      <div className="fixed left-1/2 top-4 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-zinc-950/55 px-4 py-2 text-base font-black text-white backdrop-blur-md">{chip}</span>
        {supportText ? <span className="rounded-full bg-amber-400/90 px-3 py-1.5 text-sm font-black text-zinc-900">{supportText}</span> : null}
        {paused ? <span className="rounded-full bg-white/85 px-3 py-1.5 text-sm font-black text-zinc-800">잠깐 멈춤</span> : null}
      </div>

      <div className="fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-4 px-4">
        {phase === 'listening' && (support.english || support.korean) && sentence && (player.playing || paused) ? (
          <div className="max-w-3xl rounded-2xl bg-zinc-950/70 px-6 py-3 text-center text-white">
            {support.english ? <p lang="en" className="text-2xl font-black leading-snug">{sentence.en}</p> : null}
            {support.korean ? <p lang="ko" className={support.english ? 'mt-1 text-lg font-bold leading-snug text-white/85' : 'text-2xl font-black leading-snug'}>{sentence.ko}</p> : null}
          </div>
        ) : null}
        {phase === 'listening' && player.blocked && !paused ? (
          <p className="rounded-2xl bg-white/90 px-4 py-2 text-base font-bold text-zinc-800">재생 버튼을 눌러 이야기를 시작해요</p>
        ) : null}
        {phase === 'listening' && player.error ? (
          <p role="alert" className="rounded-2xl bg-white/90 px-4 py-2 text-base font-bold text-amber-800">{player.error}</p>
        ) : null}

        {phase === 'checking' ? <CheckCard avatar={avatar} /> : null}

        {phase === 'recap' ? (
          <section className={`${glass} w-full max-w-xl p-6 text-center`}>
            <h2 className="text-2xl font-black">이야기 끝! 잘 들었어요</h2>
            <p className="mt-2 text-base font-semibold text-white/80">{story.titleKo}를 끝까지 들었어요.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button type="button" className={ghostPill} onClick={avatar.restart}><RotateCcw className="h-5 w-5" aria-hidden />처음부터</button>
              <button type="button" className={primaryPill} onClick={avatar.backToLibrary}><BookOpen className="h-5 w-5" aria-hidden />다른 이야기</button>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {phase === 'listening' ? (
            <>
              <button type="button" className={roundButton} onClick={() => avatar.replaySentence(-1)} disabled={player.index === 0}
                aria-label="앞 문장 듣기">
                <SkipBack className="h-7 w-7" aria-hidden />
              </button>
              <button type="button" className={`${roundButton} text-base font-black`} onClick={() => avatar.seekNarration(-SEEK_SECONDS)}
                aria-label={`${SEEK_SECONDS}초 전으로`}>
                -{SEEK_SECONDS}초
              </button>
              <button type="button" className={roundButton} onClick={() => avatar.replaySentence(0)} aria-label="이 문장 다시 듣기">
                <Repeat className="h-7 w-7" aria-hidden />
              </button>
              <button type="button" className={`${roundButton} text-base font-black`} onClick={() => avatar.seekNarration(SEEK_SECONDS)}
                aria-label={`${SEEK_SECONDS}초 후로`}>
                +{SEEK_SECONDS}초
              </button>
            </>
          ) : null}
          {phase !== 'recap' ? (
            <button type="button" className={roundButton} onClick={avatar.togglePause} disabled={!canPause && !paused}
              aria-label={showPlay ? '이야기 계속' : '잠깐 멈추기'}>
              {showPlay ? <Play className="ml-1 h-8 w-8" aria-hidden /> : <Pause className="h-8 w-8" aria-hidden />}
            </button>
          ) : null}
          <button type="button" className={roundButton} onClick={onExit} aria-label="이야기 나가기">
            <LogOut className="h-7 w-7" aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}

function CheckCard({ avatar }: { avatar: StoryAvatar }) {
  const { check, paused } = avatar;
  const prompt = check.prompt;
  const listening = check.status === 'listening' || check.status === 'hearing' || check.choiceListening;
  const question = prompt?.kind === 'follow_up' ? prompt.followUpKo ?? prompt.questionKo : prompt?.questionKo;

  if (check.status === 'passed') {
    return (
      <section aria-live="polite" className={`${glass} w-full max-w-2xl p-6 text-center`}>
        <p className="text-sm font-black text-emerald-300">이번 장 통과!</p>
        <p lang="ko" className="mt-1 text-xl font-black leading-snug">{check.decision?.speechKo ?? '다시 듣기 끝! 다음 장으로 갈까요?'}</p>
        <div role="group" aria-label="다시 들을 때 도움" className="mt-5 flex flex-wrap justify-center gap-2">
          {REVIEW_OPTIONS.map(({ key, label }) => {
            const on = key === 'slow' ? avatar.reviewChoice.speed === 'slow' : avatar.reviewChoice[key];
            return (
              <button key={key} type="button" aria-pressed={on} onClick={() => avatar.toggleReview(key)}
                className={`${toggleChip} ${on ? 'border-amber-300 bg-amber-400 text-zinc-900' : 'border-white/40 bg-white/10 text-white hover:bg-white/20'}`}>
                {on ? <Check className="h-4 w-4" aria-hidden /> : null}{label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button type="button" className={ghostPill} onClick={avatar.listenAgain}><RotateCcw className="h-5 w-5" aria-hidden />이 장 다시 듣기</button>
          <button type="button" className={primaryPill} onClick={avatar.goNext}><SkipForward className="h-5 w-5" aria-hidden />다음 장으로</button>
        </div>
        <p className="mt-3 text-sm font-bold text-white/70">
          {paused ? '잠깐 멈췄어요' : <>고르지 않으면 <span className="tabular-nums text-base font-black text-white">{avatar.passedLeft}</span>초 뒤 다음 장으로 넘어가요</>}
        </p>
      </section>
    );
  }

  if (check.status === 'error') {
    return (
      <section role="alert" className={`${glass} w-full max-w-2xl p-6 text-center`}>
        <p className="text-xl font-black">{check.notice ?? '확인 질문을 이어가지 못했어요.'}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" className={ghostPill} onClick={avatar.leaveCheck}><SkipForward className="h-5 w-5" aria-hidden />다음으로</button>
          <button type="button" className={primaryPill} onClick={avatar.retryCheck}><RotateCcw className="h-5 w-5" aria-hidden />다시 시도</button>
        </div>
      </section>
    );
  }

  return (
    <section aria-live="polite" className={`${glass} w-full max-w-2xl p-6`}>
      {prompt && check.status !== 'deciding' ? (
        <>
          <p className="text-sm font-black text-amber-300">질문 {Math.min(prompt.index + 1, prompt.total)} / {prompt.total}</p>
          <h2 lang="ko" className="mt-1 text-2xl font-black leading-snug">{question}</h2>
        </>
      ) : null}
      {check.status === 'deciding' && check.decision ? (
        <p lang="ko" className="text-xl font-black leading-snug">{check.decision.speechKo}</p>
      ) : null}

      {check.status === 'choices' && prompt?.choicesKo ? (
        <div className="mt-4 grid gap-2">
          {prompt.choicesKo.map((choice, index) => (
            <button key={choice} type="button" onClick={() => avatar.choose(index)} disabled={paused}
              className="min-h-14 rounded-2xl bg-white px-5 py-3 text-left text-lg font-black text-zinc-900 transition hover:bg-zinc-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70">
              {index + 1}. {choice}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-base font-bold text-white/85">
          {listening ? <Mic className="h-5 w-5 animate-pulse text-emerald-300" aria-hidden />
            : check.status === 'choices' ? null : <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
          {paused ? '잠깐 멈췄어요' : STATUS_TEXT[check.status]}
        </p>
        {listening && !paused && check.status !== 'choices' ? (
          <button type="button" className={ghostPill} onClick={avatar.answerUnknown}><HelpCircle className="h-5 w-5" aria-hidden />잘 모르겠어</button>
        ) : null}
      </div>
      {check.status === 'hearing' && check.heard ? (
        <p lang="ko" className="mt-3 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold">“{check.heard}”</p>
      ) : null}
      {check.status === 'choices' && check.choiceMiss ? (
        <p lang="ko" className="mt-3 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold">
          “{check.choiceMiss}”<span className="ml-1 text-base font-bold text-white/70">— 어떤 건지 잘 모르겠어요. “1번”처럼 말해 볼래요?</span>
        </p>
      ) : check.status === 'choices' && check.heard ? (
        <p lang="ko" className="mt-3 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold">“{check.heard}”</p>
      ) : (check.status === 'thinking' || check.status === 'choices') && check.answered ? (
        <p lang="ko" className="mt-3 rounded-2xl bg-white/10 px-4 py-2 text-lg font-bold">
          “{check.answered}”<span className="ml-1 text-base font-bold text-white/70">라고 들었어요</span>
        </p>
      ) : null}
    </section>
  );
}
