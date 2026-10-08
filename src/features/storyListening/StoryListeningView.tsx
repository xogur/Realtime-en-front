'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  ArrowLeft, BookOpen, Captions, Check, ChevronRight, Clock, Gauge, Hand, Heart, Library, Lightbulb, Pause, Play,
  RotateCcw, Search, SkipBack, SkipForward, Sparkles, Trophy, X,
} from 'lucide-react';

import './story.css';
import { StoryStage, type StagePoint } from './StoryStage';
import type { Atmosphere, SceneProps } from './scenes/odysseyScenes';
import { SceneDefs } from './scenes/parts';
import { getStory, STORIES, type StoryEntry } from './stories';
import { STORY_STEPS, STORY_STEP_META, type Story, type StoryAction, type StoryChapter, type StoryStep } from './types';
import { useManualReader } from './useManualReader';
import { useSentencePlayer, type ReadingSpeed } from './useSentencePlayer';
import { getChapterAudio, type StoryAudioClip } from './storyAudio';

type StoryListeningViewProps = {
  isOpen: boolean;
  storyId: string | null;
  onBack: () => void;
  onClose: () => void;
};

type SubtitleMode = 'off' | 'en' | 'both';
type ChapterResult = { words?: boolean; quiz?: boolean; quizChoice?: number; done?: boolean };
type SceneComponent = ComponentType<SceneProps>;
type Mood = (beat: number) => Atmosphere;

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8742a] focus-visible:ring-offset-2';
const pressable = 'transition-[transform,background-color,border-color,color,box-shadow] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100';
const primaryButton = `inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-[3px] border-[#2a1b12] bg-gradient-to-b from-[#f0a24a] to-[#d0741f] px-6 py-3 text-lg font-black text-white shadow-[0_5px_0_#2a1b12] hover:from-[#f6ae58] hover:to-[#d87e28] active:translate-y-[3px] active:shadow-[0_2px_0_#2a1b12] disabled:shadow-[0_5px_0_#2a1b12] ${pressable} ${focusRing}`;
const secondaryButton = `inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-[3px] border-[#2a1b12] bg-white px-4 py-2.5 text-base font-extrabold text-[#3d2a18] shadow-[0_4px_0_#2a1b12] hover:bg-[#fff8ee] active:translate-y-[2px] active:shadow-[0_2px_0_#2a1b12] ${pressable} ${focusRing}`;
const ghostButton = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#7a5a3a] hover:bg-[#f1e4d2] hover:text-[#3d2a18] ${pressable} ${focusRing}`;
const roundButton = `flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[#2a1b12] bg-white text-[#3d2a18] shadow-[0_4px_0_#2a1b12] hover:bg-[#fff8ee] active:translate-y-[2px] active:shadow-[0_2px_0_#2a1b12] ${pressable} ${focusRing}`;
const NO_MOOD: Mood = () => ({});
const NO_CLIPS: readonly StoryAudioClip[] = [];
const LEARNING_STEPS: readonly StoryStep[] = STORY_STEPS.filter(item => item !== 'relisten');
/** Measured pace of the recorded Odyssey narration, used to estimate stories that are not recorded yet. */
const NARRATION_WORDS_PER_MINUTE = 147;
/** Pointer travel (stage pixels) that finishes a rubbing moment: a few strokes across the scene. */
const RUB_DISTANCE = 1400;
const READING_META: Partial<Record<StoryStep, { label: string; hint: string }>> = {
  listen: { label: '읽기', hint: '그림을 보며 한 문장씩 넘겨 읽어요' },
  relisten: { label: '다시 읽기', hint: '문장을 누르면 그 장면을 다시 봐요' },
};

/** Stories without recordings are read, so their step names must not promise listening. */
function stepMeta(step: StoryStep, narrated: boolean) {
  return (!narrated && READING_META[step]) || STORY_STEP_META[step];
}

export function StoryListeningView({ isOpen, storyId, onBack, onClose }: StoryListeningViewProps) {
  // The avatar window opens the library; an unknown id still fails closed.
  if (!isOpen || !getStory(storyId)) return null;
  return <StoryShell onBack={onBack} onClose={onClose} />;
}

function StoryShell({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const entry = getStory(chosen);
  if (!entry) return <StoryLibrary onPick={setChosen} onBack={onBack} onClose={onClose} />;
  // Remount per story so a newly chosen story always starts at its cover.
  return <StoryPlayer key={entry.story.id} story={entry.story} scenes={entry.scenes} moods={entry.atmosphere}
    onLibrary={() => setChosen(null)} onBack={onBack} onClose={onClose} />;
}

/** Narration length: measured clips when recorded, otherwise words at the measured narration pace. */
export function storyMinutes(story: Story) {
  if (story.narration === 'recorded') {
    const ms = story.chapters.flatMap((chapter) => getChapterAudio(story.id, chapter)).reduce((sum, clip) => sum + clip.durationMs, 0);
    if (ms > 0) return Math.max(1, Math.round(ms / 60_000));
  }
  const words = story.chapters.flatMap((chapter) => chapter.sentences).reduce((sum, item) => sum + item.en.split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / NARRATION_WORDS_PER_MINUTE));
}

function StoryArt({ entry }: { entry: StoryEntry }) {
  const { story, scenes } = entry;
  const Scene = scenes[story.cover.chapterId];
  return (
    <div className="story-stage pointer-events-none absolute inset-0 overflow-hidden bg-[#1d2c3c]">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <SceneDefs />
        {Scene ? <Scene beat={story.cover.beats[Math.min(1, story.cover.beats.length - 1)]} /> : null}
      </svg>
    </div>
  );
}

function StoryLibrary({ onPick, onBack, onClose }: { onPick: (id: string) => void; onBack: () => void; onClose: () => void }) {
  const entries = Object.values(STORIES);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="story-library-title"
      className="story-root fixed inset-0 z-[95] flex flex-col overflow-clip bg-[#f6efe4] text-[#3d2a18]">
      <header className="flex shrink-0 items-center gap-3 border-b-[3px] border-[#2a1b12] bg-[#fff6e6] px-4 py-2.5 sm:px-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[3px] border-[#2a1b12] bg-gradient-to-br from-[#f6bd62] to-[#d0741f] text-white shadow-[0_3px_0_#2a1b12]">
          <Library className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#a0703f]">이야기 듣기</p>
          <h1 id="story-library-title" className="truncate text-xl font-black tracking-[-0.02em]">어떤 이야기를 볼까요?</h1>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" onClick={onBack} className={ghostButton}><ArrowLeft className="h-4 w-4" aria-hidden />모드 선택</button>
          <button type="button" onClick={onClose} aria-label="이야기 닫기" className={`${ghostButton} h-11 w-11 px-0`}><X className="h-5 w-5" aria-hidden /></button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
        <ul aria-label="이야기 목록" className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {entries.map((entry, index) => {
            const { story } = entry;
            return (
              <li key={story.id} className="story-ui-rise flex min-w-0 flex-col overflow-hidden rounded-[28px] border-[3px] border-[#2a1b12] bg-white shadow-[0_6px_0_#2a1b12]" style={{ animationDelay: `${index * 90}ms` }}>
                <div className="relative aspect-[2/1] min-h-[150px] border-b-[3px] border-[#2a1b12]">
                  <StoryArt entry={entry} />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1d1208]/85 via-transparent to-transparent" />
                  <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
                    <span className="rounded-full border-2 border-[#2a1b12] bg-[#ffd84d] px-3 py-1 text-sm font-black text-[#2a1b12]">{story.levelKo}</span>
                    <span className="rounded-full border-2 border-[#2a1b12] bg-white px-3 py-1 text-sm font-black text-[#2a1b12]">{story.ageKo}</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="text-2xl font-black leading-tight text-white [text-shadow:0_3px_0_#2a1b12] sm:text-3xl">{story.titleKo}</p>
                    <p lang="en" className="text-base font-black text-[#ffe2b0]">{story.title}</p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-black text-[#a0703f]">
                    <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" aria-hidden />{story.chapters.length}장</span>
                    <span className="flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden />이야기 약 {storyMinutes(story)}분</span>
                  </div>
                  <p className="text-base font-bold leading-7 text-[#5a3d22]">{story.summaryKo}</p>
                  <p className="text-xs font-semibold leading-5 text-[#a08466]">{story.sourceKo}</p>
                  {story.narration === 'pending' ? (
                    <p className="flex items-start gap-2 rounded-2xl bg-[#fff1d6] px-3 py-2 text-sm font-bold leading-6 text-[#8a5a24]">
                      <Captions className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />목소리는 준비 중이에요. 지금은 글을 한 문장씩 넘기며 읽어요.
                    </p>
                  ) : null}
                  <div className="mt-auto pt-2">
                    <button type="button" onClick={() => onPick(story.id)} aria-label={`${story.titleKo} 시작`} className={`${primaryButton} w-full`}>
                      <Play className="h-5 w-5" aria-hidden />이 이야기 시작
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

function StoryPlayer({ story, scenes, moods, onLibrary, onBack, onClose }: {
  story: Story; scenes: Record<string, SceneComponent>; moods: Record<string, Mood>; onLibrary: () => void; onBack: () => void; onClose: () => void;
}) {
  const narrated = story.narration === 'recorded';
  const [phase, setPhase] = useState<'cover' | 'chapter' | 'recap'>('cover');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [step, setStep] = useState<StoryStep>('listen');
  const [replayReturnStep, setReplayReturnStep] = useState<StoryStep>('listen');
  const [results, setResults] = useState<Record<string, ChapterResult>>({});
  const [subtitles, setSubtitles] = useState<SubtitleMode>('both');
  const [speed, setSpeed] = useState<ReadingSpeed>('normal');
  const chapter = story.chapters[chapterIndex];
  const Scene = scenes[chapter.id];
  const mood = moods[chapter.id] ?? NO_MOOD;
  const finale = story.chapters[story.chapters.length - 1];

  const record = useCallback((id: string, patch: ChapterResult) => {
    setResults((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }, []);

  const openChapter = useCallback((index: number) => {
    setChapterIndex(index);
    setStep('listen');
    setPhase('chapter');
  }, []);

  const finishChapter = useCallback(() => {
    record(chapter.id, { done: true });
    if (chapterIndex + 1 < story.chapters.length) openChapter(chapterIndex + 1);
    else setPhase('recap');
  }, [chapter.id, chapterIndex, openChapter, record, story.chapters.length]);

  const restart = useCallback(() => {
    setResults({});
    openChapter(0);
  }, [openChapter]);

  const nextStep = useCallback(() => {
    const index = LEARNING_STEPS.indexOf(step);
    if (index >= 0 && index + 1 < LEARNING_STEPS.length) setStep(LEARNING_STEPS[index + 1]);
    else finishChapter();
  }, [finishChapter, step]);

  const recordWords = useCallback(() => record(chapter.id, { words: true }), [chapter.id, record]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-title"
      className="story-root fixed inset-0 z-[95] flex flex-col overflow-clip bg-[#f6efe4] text-[#3d2a18]"
    >
      <header className="flex shrink-0 items-center gap-3 border-b-[3px] border-[#2a1b12] bg-[#fff6e6] px-4 py-2.5 sm:px-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[3px] border-[#2a1b12] bg-gradient-to-br from-[#f6bd62] to-[#d0741f] text-white shadow-[0_3px_0_#2a1b12]">
          <BookOpen className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#a0703f]">이야기 듣기 · {story.title}</p>
          <h1 id="story-title" className="truncate text-xl font-black tracking-[-0.02em]">
            {phase === 'chapter' ? `${chapterIndex + 1}장. ${chapter.titleKo}` : story.titleKo}
          </h1>
        </div>
        {phase !== 'cover' ? (
          <nav aria-label="이야기 장면" className="ml-auto hidden items-center gap-1 md:flex">
            {story.chapters.map((item, index) => {
              const done = results[item.id]?.done;
              const current = phase === 'chapter' && index === chapterIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openChapter(index)}
                  aria-label={`${index + 1}장 ${item.titleKo}${done ? ' 완료' : ''}`}
                  aria-current={current ? 'step' : undefined}
                  className={`flex h-9 min-w-9 items-center justify-center rounded-full border-[2.5px] px-1.5 text-sm font-black ${pressable} ${focusRing} ${current
                    ? 'border-[#2a1b12] bg-[#d0741f] text-white shadow-[0_3px_0_#2a1b12]'
                    : done ? 'border-[#2a1b12] bg-[#f6d9a8] text-[#5a3d22]' : 'border-[#d9c7ae] bg-white text-[#b39a80]'}`}
                >
                  {done && !current ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : index + 1}
                </button>
              );
            })}
          </nav>
        ) : null}
        <div className={`flex shrink-0 items-center gap-1 ${phase === 'cover' ? 'ml-auto' : 'md:ml-3'}`}>
          {phase === 'chapter' ? (
            <button type="button" onClick={() => {
              if (step === 'relisten') setStep(replayReturnStep);
              else { setReplayReturnStep(step); setStep('relisten'); }
            }} className={ghostButton}>
              <RotateCcw className="h-4 w-4" aria-hidden />{step === 'relisten' ? '학습으로 돌아가기' : stepMeta('relisten', narrated).label}
            </button>
          ) : (
            <button type="button" onClick={onLibrary} className={ghostButton}>
              <Library className="h-4 w-4" aria-hidden />다른 이야기
            </button>
          )}
          <button type="button" onClick={onBack} className={ghostButton}>
            <ArrowLeft className="h-4 w-4" aria-hidden />모드 선택
          </button>
          <button type="button" onClick={onClose} aria-label="이야기 닫기" className={`${ghostButton} h-11 w-11 px-0`}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </header>

      {phase === 'chapter' ? <StepRail step={step} narrated={narrated} onSelect={setStep} /> : null}

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(360px,410px)] lg:grid-rows-1">
        {phase === 'cover' ? (
          <Cover story={story} Scene={scenes[story.cover.chapterId] ?? scenes[story.chapters[0].id]} mood={moods[story.cover.chapterId] ?? NO_MOOD} onStart={() => openChapter(0)} />
        ) : phase === 'recap' ? (
          <Recap story={story} results={results} Scene={scenes[finale.id]} onRestart={restart} onLibrary={onLibrary} onClose={onClose} />
        ) : step === 'listen' ? (
          <ListenStep key={`${chapter.id}-listen`} storyId={story.id} narrated={narrated} chapter={chapter} index={chapterIndex} Scene={Scene} mood={mood}
            subtitles={subtitles} setSubtitles={setSubtitles} speed={speed} setSpeed={setSpeed} onNext={nextStep} />
        ) : step === 'words' ? (
          <WordsStep key={`${chapter.id}-words`} storyId={story.id} narrated={narrated} chapter={chapter} Scene={Scene} mood={mood} onComplete={recordWords} onNext={nextStep} />
        ) : step === 'quiz' ? (
          <QuizStep key={`${chapter.id}-quiz`} storyId={story.id} narrated={narrated} chapter={chapter} Scene={Scene} mood={mood}
            initialAnswer={results[chapter.id]?.quizChoice} onAnswer={(correct, quizChoice) => record(chapter.id, { quiz: correct, quizChoice })} isLast={chapterIndex === story.chapters.length - 1} onNext={finishChapter} />
        ) : (
          <RelistenStep key={`${chapter.id}-relisten`} storyId={story.id} narrated={narrated} chapter={chapter} Scene={Scene} mood={mood} speed={speed}
            isLast={chapterIndex === story.chapters.length - 1} onNext={finishChapter} />
        )}
      </main>
    </div>
  );
}

function StepRail({ step, narrated, onSelect }: { step: StoryStep; narrated: boolean; onSelect: (step: StoryStep) => void }) {
  const current = LEARNING_STEPS.indexOf(step);
  return (
    <ol aria-label="장면 학습 3단계" className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#6b4a2b]/10 bg-[#fffaf2] px-4 py-2 sm:px-6">
      {LEARNING_STEPS.map((item, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li key={item} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-4 w-4 text-[#cdb79c]" aria-hidden /> : null}
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-current={active ? 'step' : undefined}
              className={`flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-extrabold ${pressable} ${focusRing} ${active
                ? 'bg-[#2a1b12] text-white' : done ? 'text-[#8a6440] hover:bg-[#f1e4d2]' : 'text-[#b39a80] hover:bg-[#f1e4d2]'}`}
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${active ? 'bg-[#f6bd62] text-[#2a1b12]' : done ? 'bg-[#f6d9a8]' : 'bg-[#efe5d8]'}`}>
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : index + 1}
              </span>
              {stepMeta(item, narrated).label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StagePane({ children }: { children: ReactNode }) {
  return <section className="relative min-h-[260px] min-w-0 lg:min-h-0">{children}</section>;
}

function Panel({ step, narrated = true, children, footer }: { step?: StoryStep; narrated?: boolean; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside className="flex max-h-[46dvh] min-h-0 flex-col border-t-[3px] border-[#2a1b12] bg-[#fffaf2] lg:max-h-none lg:border-l-[3px] lg:border-t-0">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {step ? (
          <div className="story-ui-rise mb-4">
            <p className="text-sm font-black text-[#d0741f]">{step === 'relisten' ? '' : `${LEARNING_STEPS.indexOf(step) + 1}단계 · `}{stepMeta(step, narrated).label}</p>
            <p className="mt-1 text-base font-semibold text-[#8a6a4a]">{stepMeta(step, narrated).hint}</p>
          </div>
        ) : null}
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t border-[#6b4a2b]/10 px-5 pb-5 pt-4 sm:px-6">{footer}</div> : null}
    </aside>
  );
}

function Cover({ story, Scene, mood, onStart }: { story: Story; Scene: SceneComponent; mood: Mood; onStart: () => void }) {
  const beats = story.cover.beats;
  const [frame, setFrame] = useState(0);
  const beat = beats[frame % beats.length] ?? 0;
  useEffect(() => {
    // The cover loops one scene like a title sequence.
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % beats.length), 3600);
    return () => window.clearInterval(timer);
  }, [beats.length]);
  return (
    <>
      <StagePane>
        <StoryStage Scene={Scene} beat={beat} atmosphere={mood(beat)} label={`${story.titleKo} 표지 장면`} intro>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1d1208]/85 via-[#1d1208]/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
            <p className="story-title-in text-sm font-black uppercase tracking-[0.3em] text-[#f6c47a]">An Interactive Story</p>
            <h2 className="story-title-in mt-2 text-4xl font-black leading-tight text-white [text-shadow:0_4px_0_#2a1b12] sm:text-6xl" style={{ animationDelay: '.15s' }}>{story.title}</h2>
            <p className="story-title-in mt-2 text-2xl font-black text-[#ffe2b0]" style={{ animationDelay: '.3s' }}>{story.titleKo}</p>
          </div>
        </StoryStage>
      </StagePane>
      <Panel footer={<button type="button" onClick={onStart} className={`${primaryButton} w-full`}><Play className="h-5 w-5" aria-hidden />이야기 시작하기</button>}>
        <p className="text-lg font-bold leading-8 text-[#5a3d22]">{story.summaryKo}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {LEARNING_STEPS.map((item, index) => (
            <div key={item} className="story-ui-rise rounded-2xl border-2 border-[#2a1b12]/80 bg-white p-3 shadow-[0_3px_0_rgba(42,27,18,0.8)]" style={{ animationDelay: `${index * 80}ms` }}>
              <p className="text-xs font-black text-[#d0741f]">{index + 1}단계</p>
              <p className="text-base font-black">{stepMeta(item, story.narration === 'recorded').label}</p>
              <p className="mt-0.5 text-sm font-semibold text-[#8a6a4a]">{stepMeta(item, story.narration === 'recorded').hint}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#fff1d6] p-3 text-sm font-bold leading-6 text-[#8a5a24]">
          <Hand className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{story.handsOnKo}
        </p>
        {story.narration === 'pending' ? (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-[#eef4fb] p-3 text-sm font-bold leading-6 text-[#3f5f86]">
            <Captions className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />목소리는 준비 중이에요. 지금은 그림을 보며 한 문장씩 넘겨 읽어요.
          </p>
        ) : null}
        <ol className="mt-4 space-y-1.5">
          {story.chapters.map((item, index) => (
            <li key={item.id} className="flex items-baseline gap-3 text-base">
              <span className="w-6 shrink-0 text-right font-black text-[#d0741f]">{index + 1}</span>
              <span className="font-extrabold">{item.titleKo}</span>
              <span className="truncate text-sm font-semibold text-[#a08466]">{item.title}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}

/** Sentence highlighting follows the recording; no estimated word timestamps. */
function Subtitle({ en, ko, mode }: { en: string; ko: string; mode: SubtitleMode }) {
  if (mode === 'off') return null;
  return (
    <div key={en} className="story-ui-rise pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#140c05]/90 via-[#140c05]/60 to-transparent px-6 pb-6 pt-20 text-center sm:px-12">
      <p lang="en" className="text-2xl font-black leading-snug sm:text-[2rem]">
        <span className="text-[#ffe2a6]">{en}</span>
      </p>
      {mode === 'both' ? <p className="mt-2 text-lg font-bold text-[#ffe2b0]">{ko}</p> : null}
    </div>
  );
}

function SentenceProgress({ count, index, progress, actions, onJump }: {
  count: number; index: number; progress: number; actions: readonly boolean[]; onJump: (index: number) => void;
}) {
  return (
    <div className="flex gap-1.5" aria-label={`${count}문장 중 ${index + 1}번째`}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onJump(i)}
          aria-label={`${i + 1}번째 문장으로`}
          className={`relative h-3.5 flex-1 overflow-hidden rounded-full border-2 border-[#2a1b12]/70 bg-[#f1e4d2] ${focusRing}`}
        >
          {i < index ? <span className="absolute inset-0 bg-[#d0741f]" /> : null}
          {i === index ? (
            <span
              className="absolute inset-y-0 left-0 bg-[#f0a24a]"
              style={{ width: `${progress * 100}%` }}
            />
          ) : null}
          {actions[i] ? <Hand className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 text-[#2a1b12]" aria-hidden /> : null}
        </button>
      ))}
    </div>
  );
}

function AudioNotice({ player }: { player: ReturnType<typeof useSentencePlayer> }) {
  if (player.blocked || player.error) return (
    <div role="status" className="mt-3 rounded-2xl bg-[#fff1d6] p-3 text-sm font-bold text-[#8a5a24]">
      <p>{player.blocked ? '버튼을 눌러 소리를 켜 주세요.' : player.error}</p>
      <button type="button" onClick={player.play} className={`${secondaryButton} mt-2`}>
        <Play className="h-4 w-4" aria-hidden />{player.blocked ? '소리 켜고 시작' : '다시 재생'}
      </button>
    </div>
  );
  return player.loading ? <p role="status" className="mt-3 text-sm font-bold text-[#8a5a24]">소리를 준비하고 있어요…</p> : null;
}

function Segmented<T extends string>({ label, icon, value, options, onChange }: {
  label: string; icon: ReactNode; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-16 shrink-0 items-center gap-1.5 text-sm font-black text-[#8a6a4a]">{icon}{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-1 rounded-2xl bg-[#f1e4d2] p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-10 flex-1 rounded-xl px-2 text-sm font-extrabold ${pressable} ${focusRing} ${value === option.value ? 'bg-white text-[#2a1b12] shadow-[0_2px_0_#2a1b12]' : 'text-[#8a6a4a]'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function hotspotWord(chapter: StoryChapter, id: string) {
  const word = chapter.words.find((item) => item.hotspot === id);
  return word ? `${word.word} · ${word.ko}` : null;
}

/** The recorded player or, for stories without recordings, the touch pager. Both hooks always run. */
function useNarration(storyId: string, narrated: boolean, chapter: StoryChapter, speed: ReadingSpeed, isBlocked?: (index: number) => boolean, singleSentence = false) {
  const clips = useMemo(() => (narrated ? getChapterAudio(storyId, chapter) : NO_CLIPS), [chapter, narrated, storyId]);
  const lines = useMemo(() => chapter.sentences.map((item) => item.en), [chapter]);
  const audio = useSentencePlayer(lines, speed, isBlocked, clips, singleSentence);
  const reader = useManualReader(lines.length, isBlocked);
  return narrated ? { ...audio, next: () => audio.jump(audio.index + 1) } : reader;
}

function actionHeading(action: StoryAction) {
  return action.kind === 'hold' ? '길게 눌러요' : action.kind === 'rub' ? '문질러 닦아요' : action.kind === 'feel' ? '마음을 골라요' : '직접 해 봐요';
}

function ListenStep({ storyId, narrated, chapter, index, Scene, mood, subtitles, setSubtitles, speed, setSpeed, onNext }: {
  storyId: string; narrated: boolean; chapter: StoryChapter; index: number; Scene: SceneComponent; mood: Mood;
  subtitles: SubtitleMode; setSubtitles: (mode: SubtitleMode) => void;
  speed: ReadingSpeed; setSpeed: (speed: ReadingSpeed) => void; onNext: () => void;
}) {
  const [doneActions, setDoneActions] = useState<ReadonlySet<number>>(() => new Set());
  const isBlocked = useCallback((i: number) => Boolean(chapter.sentences[i]?.action) && !doneActions.has(i), [chapter, doneActions]);
  const player = useNarration(storyId, narrated, chapter, speed, isBlocked);
  const [started, setStarted] = useState(false);
  const [taps, setTaps] = useState(0);
  const [hold, setHold] = useState<StagePoint | null>(null);
  const [rub, setRub] = useState<{ amount: number; at: StagePoint | null }>({ amount: 0, at: null });
  const [wrongFeel, setWrongFeel] = useState<number | null>(null);
  const [cheer, setCheer] = useState(0);
  const holdTimerRef = useRef<number | null>(null);
  const rubRef = useRef<{ active: boolean; last: StagePoint | null; travelled: number }>({ active: false, last: null, travelled: 0 });
  const { play, release } = player;
  const sentence = chapter.sentences[player.index];
  const action = player.waiting ? sentence.action ?? null : null;
  const reachedEnd = player.finished;
  const beat = !started ? 0 : action ? chapter.sentences[player.index - 1]?.beat ?? 0 : sentence.beat;
  const isLastSentence = player.index === chapter.sentences.length - 1;
  // Without a recording there is nothing to listen to, so subtitles always stay on.
  const subtitleMode: SubtitleMode = !narrated && subtitles === 'off' ? 'en' : subtitles;

  const start = useCallback(() => {
    setStarted(true);
    play();
  }, [play]);

  useEffect(() => {
    if (started) return;
    // Hold the chapter title card briefly, then begin like an animated short.
    const timer = window.setTimeout(start, 2800);
    return () => window.clearTimeout(timer);
  }, [start, started]);

  useEffect(() => () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
  }, []);

  const complete = useCallback(() => {
    setDoneActions((current) => new Set(current).add(player.index));
    setTaps(0);
    setHold(null);
    setRub({ amount: 0, at: null });
    rubRef.current = { active: false, last: null, travelled: 0 };
    setWrongFeel(null);
    setCheer((value) => value + 1);
    release();
  }, [player.index, release]);

  const onHotspot = useCallback((id: string) => {
    if (!action || action.kind !== 'tap' || id !== action.target) return;
    const next = taps + 1;
    if (next >= (action.count ?? 1)) complete();
    else setTaps(next);
  }, [action, complete, taps]);

  const onPress = useCallback((id: string, phase: 'down' | 'up', point: StagePoint) => {
    if (!action || id !== action.target) return;
    if (action.kind === 'rub') {
      rubRef.current = { ...rubRef.current, active: phase === 'down', last: phase === 'down' ? { ...point } : null };
      return;
    }
    if (action.kind !== 'hold') return;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (phase === 'down') {
      setHold({ ...point });
      holdTimerRef.current = window.setTimeout(complete, 1400);
    } else setHold(null);
  }, [action, complete]);

  const onDrag = useCallback((point: StagePoint) => {
    const state = rubRef.current;
    if (!state.active) return;
    const travelled = state.travelled + (state.last ? Math.hypot(point.x - state.last.x, point.y - state.last.y) : 0);
    rubRef.current = { active: true, last: { ...point }, travelled };
    if (travelled >= RUB_DISTANCE) complete();
    else setRub({ amount: travelled / RUB_DISTANCE, at: { ...point } });
  }, [complete]);

  const chooseFeeling = (choice: number) => {
    if (!action || action.kind !== 'feel') return;
    if (choice === action.answer) complete();
    else setWrongFeel(choice);
  };

  const jumpTo = (i: number) => {
    setStarted(true);
    setTaps(0);
    player.jump(i);
  };

  const turnPage = () => {
    setStarted(true);
    if (isLastSentence && reachedEnd) onNext();
    else player.next();
  };

  return (
    <>
      <StagePane>
        <StoryStage
          Scene={Scene}
          beat={beat}
          bubble={started && !action ? sentence.bubble : undefined}
          atmosphere={mood(beat)}
          highlight={action?.target ?? null}
          hint={started && !action}
          intro
          label={`${chapter.titleKo} 장면. 그림을 누르면 영어 이름이 보여요.`}
          onHotspot={onHotspot}
          onPress={onPress}
          onDrag={action?.kind === 'rub' ? onDrag : undefined}
          effort={action?.kind === 'rub' ? rub.amount : undefined}
          tapLabel={(id) => (action ? null : hotspotWord(chapter, id))}
        >
          {started && !action ? <Subtitle en={sentence.en} ko={sentence.ko} mode={subtitleMode} /> : null}
          {started && !action && !narrated ? (
            <button
              type="button"
              onClick={turnPage}
              aria-label={isLastSentence && reachedEnd ? '다음 단계로' : '다음 문장'}
              className={`story-ui-rise absolute bottom-5 right-5 z-20 flex h-16 min-w-16 items-center justify-center gap-1 rounded-full border-[3px] border-[#2a1b12] bg-gradient-to-b from-[#f0a24a] to-[#d0741f] px-5 text-lg font-black text-white shadow-[0_5px_0_#2a1b12] active:translate-y-[2px] active:shadow-[0_3px_0_#2a1b12] ${pressable} ${focusRing}`}
            >
              {isLastSentence && reachedEnd ? '듣기 학습' : null}<ChevronRight className="h-8 w-8" aria-hidden />
            </button>
          ) : null}
          {action ? (
            // A feeling card sits low so the character's face stays in view.
            <div key={player.index} className={`story-ui-rise absolute left-1/2 z-20 w-[min(92%,600px)] -translate-x-1/2 rounded-3xl border-[3px] border-[#2a1b12] bg-white px-6 py-4 text-center shadow-[0_6px_0_#2a1b12] ${action.kind === 'feel' ? 'bottom-5' : 'top-5'}`}>
              <p className="flex items-center justify-center gap-2 text-sm font-black text-[#d0741f]">
                {action.kind === 'feel' ? <Heart className="h-5 w-5" aria-hidden /> : <Hand className="story-finger h-5 w-5" aria-hidden />}{actionHeading(action)}
              </p>
              <p lang="en" className="mt-1 text-2xl font-black leading-snug text-[#2a1b12]">{action.promptEn}</p>
              <p className="mt-1 text-base font-bold text-[#8a6a4a]">{action.promptKo}</p>
              {(action.count ?? 1) > 1 ? (
                <div className="mt-3 flex justify-center gap-2" aria-label={`${action.count}번 중 ${taps}번`}>
                  {Array.from({ length: action.count ?? 1 }, (_, i) => (
                    <span key={i} className={`h-4 w-4 rounded-full border-2 border-[#2a1b12] ${i < taps ? 'bg-[#f0a24a]' : 'bg-[#f1e4d2]'}`} />
                  ))}
                </div>
              ) : null}
              {action.kind === 'rub' ? (
                <div className="mx-auto mt-3 h-4 w-full max-w-[320px] overflow-hidden rounded-full border-2 border-[#2a1b12] bg-[#f1e4d2]"
                  role="progressbar" aria-label="비늘 닦기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rub.amount * 100)}>
                  <span className="block h-full bg-gradient-to-r from-[#7ac7f0] to-[#4f8fe0] transition-[width] duration-150" style={{ width: `${rub.amount * 100}%` }} />
                </div>
              ) : null}
              {action.kind === 'feel' && action.choices ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {action.choices.map((choice, i) => (
                    <button
                      key={choice.en}
                      type="button"
                      onClick={() => chooseFeeling(i)}
                      className={`flex min-h-24 flex-col items-center justify-center rounded-2xl border-[3px] px-2 py-2 ${pressable} ${focusRing} ${wrongFeel === i
                        ? 'story-ui-shake border-[#2a1b12] bg-[#fcebe6]' : 'border-[#e3d3bd] bg-[#fffaf2] hover:border-[#2a1b12]/60'}`}
                    >
                      <span className="text-4xl leading-none" aria-hidden>{choice.face}</span>
                      <span lang="en" className="mt-1 text-lg font-black text-[#2a1b12]">{choice.en}</span>
                      <span className="text-sm font-bold text-[#a08466]">{choice.ko}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {wrongFeel !== null ? <p role="status" className="mt-2 text-sm font-black text-[#b5452f]">표정을 다시 보고 골라 봐요.</p> : null}
            </div>
          ) : null}
          {hold ? (
            <svg aria-hidden className="pointer-events-none absolute z-30 h-28 w-28 -translate-x-1/2 -translate-y-1/2" style={{ left: hold.x, top: hold.y }} viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="rgba(255,255,255,0.35)" stroke="#2a1b12" strokeWidth="6" opacity="0.4" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="#f0a24a" strokeWidth="8" strokeLinecap="round" strokeDasharray="283" className="story-hold" transform="rotate(-90 50 50)" />
            </svg>
          ) : null}
          {rub.at ? (
            <span key={Math.round(rub.amount * 40)} aria-hidden className="story-rub-spark pointer-events-none absolute z-30 h-10 w-10 -translate-x-1/2 -translate-y-1/2" style={{ left: rub.at.x, top: rub.at.y }}>
              <svg viewBox="-20 -20 40 40" className="h-full w-full"><path d="M0 -18 L5 -5 L18 0 L5 5 L0 18 L-5 5 L-18 0 L-5 -5 Z" fill="#ffffff" stroke="#7ac7f0" strokeWidth="2" /></svg>
            </span>
          ) : null}
          {cheer ? (
            <p key={cheer} aria-live="polite" className="story-cheer pointer-events-none absolute left-1/2 top-[38%] rounded-full border-[3px] border-[#2a1b12] bg-[#ffd84d] px-8 py-3 text-3xl font-black text-[#2a1b12] shadow-[0_6px_0_#2a1b12]">
              Great job!
            </p>
          ) : null}
          {!started ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#140c05]/55 text-center">
              <span className="story-letterbox absolute inset-x-0 top-0 h-[12%] origin-top bg-black" />
              <span className="story-letterbox absolute inset-x-0 bottom-0 h-[12%] origin-bottom bg-black" />
              <p className="story-title-in text-lg font-black uppercase tracking-[0.3em] text-[#f6c47a]">Chapter {index + 1}</p>
              <h2 className="story-title-in mt-2 px-6 text-4xl font-black text-white [text-shadow:0_4px_0_#2a1b12] sm:text-6xl" style={{ animationDelay: '.12s' }}>{chapter.title}</h2>
              <p className="story-title-in mt-2 text-2xl font-black text-[#ffe2b0]" style={{ animationDelay: '.24s' }}>{chapter.titleKo}</p>
              <button type="button" onClick={start} className={`${primaryButton} story-title-in mt-8`} style={{ animationDelay: '.4s' }}>
                <Play className="h-5 w-5" aria-hidden />바로 시작
              </button>
            </div>
          ) : null}
        </StoryStage>
      </StagePane>
      <Panel
        step="listen"
        narrated={narrated}
        footer={<button type="button" onClick={onNext} disabled={!reachedEnd} className={`${primaryButton} w-full`}>
          다음: 듣기 학습<ChevronRight className="h-5 w-5" aria-hidden />
        </button>}
      >
        <SentenceProgress count={chapter.sentences.length} index={player.index} progress={player.progress}
          actions={chapter.sentences.map((item) => Boolean(item.action))} onJump={jumpTo} />
        {narrated ? <AudioNotice player={player} /> : null}
        <p className="mt-2 text-sm font-bold text-[#a08466]">
          {action ? '장면에서 직접 해 보면 이야기가 이어져요' : `${chapter.sentences.length}문장 중 ${player.index + 1}번째`}
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button type="button" aria-label="이전 문장" onClick={() => jumpTo(player.index - 1)} className={roundButton}>
            <SkipBack className="h-6 w-6" aria-hidden />
          </button>
          {narrated ? (
            <button
              type="button"
              aria-label={(player.playing || player.loading) ? '일시정지' : '재생'}
              disabled={Boolean(action)}
              onClick={() => ((player.playing || player.loading) ? player.pause() : start())}
              className={`flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-[#2a1b12] bg-gradient-to-b from-[#f0a24a] to-[#d0741f] text-white shadow-[0_6px_0_#2a1b12] active:translate-y-[3px] active:shadow-[0_3px_0_#2a1b12] ${pressable} ${focusRing}`}
            >
              {(player.playing || player.loading) ? <Pause className="h-9 w-9" aria-hidden /> : <Play className="ml-1 h-9 w-9" aria-hidden />}
            </button>
          ) : (
            <button
              type="button"
              aria-label="다음 문장 읽기"
              disabled={Boolean(action) || (isLastSentence && reachedEnd)}
              onClick={turnPage}
              className={`flex h-20 min-w-20 items-center justify-center gap-1 rounded-full border-[3px] border-[#2a1b12] bg-gradient-to-b from-[#f0a24a] to-[#d0741f] px-5 text-lg font-black text-white shadow-[0_6px_0_#2a1b12] active:translate-y-[3px] active:shadow-[0_3px_0_#2a1b12] ${pressable} ${focusRing}`}
            >
              다음<ChevronRight className="h-7 w-7" aria-hidden />
            </button>
          )}
          <button type="button" aria-label="다음 문장" onClick={() => jumpTo(player.index + 1)} className={roundButton}>
            <SkipForward className="h-6 w-6" aria-hidden />
          </button>
        </div>
        <div className="mt-5 space-y-2.5">
          <Segmented label="자막" icon={<Captions className="h-4 w-4" aria-hidden />} value={subtitleMode} onChange={setSubtitles}
            options={narrated
              ? [{ value: 'off', label: '끄기' }, { value: 'en', label: '영어' }, { value: 'both', label: '영어+한글' }]
              : [{ value: 'en', label: '영어' }, { value: 'both', label: '영어+한글' }]} />
          {narrated ? (
            <Segmented label="속도" icon={<Gauge className="h-4 w-4" aria-hidden />} value={speed} onChange={setSpeed}
              options={[{ value: 'slow', label: '천천히' }, { value: 'normal', label: '보통' }]} />
          ) : null}
        </div>
        {narrated ? null : (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#eef4fb] p-3 text-sm font-bold leading-6 text-[#3f5f86]">
            <Captions className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />목소리는 준비 중이에요. 문장을 다 읽으면 다음 버튼을 눌러요.
          </p>
        )}
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-[#fff1d6] p-3 text-sm font-bold leading-6 text-[#8a5a24]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />반짝이는 인물이나 물건을 눌러 보세요. 화면을 움직이면 장면이 따라 움직여요.
        </p>
      </Panel>
    </>
  );
}

function exampleSentence(chapter: StoryChapter, word: string) {
  const pattern = new RegExp(`\\b${word}`, 'i');
  return chapter.sentences.find((item) => pattern.test(item.en)) ?? null;
}

function HighlightWords({ text, words }: { text: string; words: readonly string[] }) {
  const pattern = new RegExp(`\\b(${words.join('|')})\\w*`, 'gi');
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(<mark key={at} className="rounded bg-[#ffe2a6] px-0.5 text-inherit">{match[0]}</mark>);
    last = at + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function WordsStep({ storyId, narrated, chapter, Scene, mood, onComplete, onNext }: {
  storyId: string; narrated: boolean; chapter: StoryChapter; Scene: SceneComponent; mood: Mood; onComplete: () => void; onNext: () => void;
}) {
  const player = useNarration(storyId, narrated, chapter, 'normal', undefined, true);
  const [selected, setSelected] = useState<number | null>(null);
  const [game, setGame] = useState<{ order: number[]; at: number; misses: number; feedback: 'right' | 'wrong' | null } | null>(null);
  const words = chapter.words;
  const done = game !== null && game.at >= game.order.length;
  const target = game && !done ? words[game.order[game.at]] : null;
  const focusWord = target ?? (selected !== null ? words[selected] : null);
  const lastBeat = chapter.sentences[chapter.sentences.length - 1].beat;
  const beat = focusWord ? focusWord.beat : lastBeat;

  useEffect(() => {
    if (game?.feedback !== 'right') return;
    const timer = window.setTimeout(() => {
      setGame((current) => current && { ...current, at: current.at + 1, misses: 0, feedback: null });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [game?.feedback]);

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!done || reportedRef.current) return;
    reportedRef.current = true;
    onComplete();
  }, [done, onComplete]);

  const startGame = () => {
    player.pause();
    const order = words.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    setSelected(null);
    setGame({ order, at: 0, misses: 0, feedback: null });
  };

  const onHotspot = (id: string) => {
    if (game && target) {
      if (game.feedback === 'right') return;
      if (target.hotspot === id) setGame({ ...game, feedback: 'right' });
      else setGame({ ...game, misses: game.misses + 1, feedback: 'wrong' });
      return;
    }
    const index = words.findIndex((item) => item.hotspot === id);
    if (index >= 0) setSelected(index);
  };

  const example = selected !== null ? exampleSentence(chapter, words[selected].word) : null;
  const showHint = game !== null && target !== null && (game.misses >= 2 || game.feedback === 'right');

  return (
    <>
      <StagePane>
        <StoryStage
          Scene={Scene}
          beat={beat}
          atmosphere={done ? { ...mood(beat), particles: 'confetti' } : mood(beat)}
          label={`${chapter.titleKo} 장면. 단어에 해당하는 그림을 눌러 보세요.`}
          highlight={target ? (showHint ? target.hotspot ?? null : null) : focusWord?.hotspot ?? null}
          onHotspot={onHotspot}
          tapLabel={(id) => (game ? null : hotspotWord(chapter, id))}
        >
          {target ? (
            <div key={`${game?.at}`} className="story-ui-rise absolute left-1/2 top-5 -translate-x-1/2 rounded-3xl border-[3px] border-[#2a1b12] bg-white px-8 py-3 text-center shadow-[0_6px_0_#2a1b12]">
              <p className="text-sm font-black text-[#d0741f]">장면에서 찾아 눌러 보세요</p>
              <p lang="en" className="text-4xl font-black tracking-[-0.02em]">{target.word}</p>
            </div>
          ) : null}
          {game?.feedback ? (
            <div key={`${game.at}-${game.misses}-${game.feedback}`} role="status"
              className={`story-ui-rise absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border-[3px] border-[#2a1b12] px-6 py-3 text-xl font-black shadow-[0_5px_0_#2a1b12] ${game.feedback === 'right' ? 'bg-[#5fb36f] text-white' : 'story-ui-shake bg-white text-[#b5452f]'}`}>
              {game.feedback === 'right' ? `정답! ${target?.word ?? ''} = ${target?.ko ?? ''}` : game.misses >= 2 ? '반짝이는 곳을 눌러 보세요' : '다시 찾아보세요'}
            </div>
          ) : null}
        </StoryStage>
      </StagePane>
      <Panel
        step="words"
        narrated={narrated}
        footer={done
          ? <button type="button" onClick={onNext} className={`${primaryButton} w-full`}>다음: 문맥 이해<ChevronRight className="h-5 w-5" aria-hidden /></button>
          : game
            ? <button type="button" onClick={() => setGame(null)} className={`${secondaryButton} w-full`}>단어 다시 살펴보기</button>
            : (
              <div className="flex gap-2">
                <button type="button" onClick={startGame} className={`${primaryButton} flex-1`}><Search className="h-5 w-5" aria-hidden />단어 찾기 놀이</button>
                <button type="button" onClick={onNext} className={ghostButton}>건너뛰기</button>
              </div>
            )}
      >
        {done ? (
          <div className="story-ui-rise rounded-3xl border-[3px] border-[#2a1b12] bg-[#eaf5e8] p-5 text-center shadow-[0_5px_0_#2a1b12]">
            <Sparkles className="mx-auto h-10 w-10 text-[#3f8a52]" aria-hidden />
            <p className="mt-2 text-2xl font-black text-[#2f6b3e]">단어 {words.length}개를 모두 찾았어요!</p>
          </div>
        ) : game ? (
          <div>
            <p className="text-base font-bold text-[#8a6a4a]">{game.order.length}개 중 {game.at + 1}번째 단어</p>
            <div className="mt-2 flex gap-1.5">
              {game.order.map((_, i) => <span key={i} className={`h-3 flex-1 rounded-full border-2 border-[#2a1b12]/70 ${i < game.at ? 'bg-[#5fb36f]' : i === game.at ? 'bg-[#f0a24a]' : 'bg-[#f1e4d2]'}`} />)}
            </div>
            {target ? (
              <div className="mt-5 rounded-3xl border-[3px] border-[#2a1b12] bg-white p-5 text-center shadow-[0_5px_0_#2a1b12]">
                <p lang="en" className="text-4xl font-black">{target.word}</p>
                <p className="mt-1 text-lg font-bold text-[#a08466]">{game.misses >= 1 || game.feedback === 'right' ? target.ko : '뜻을 떠올리며 찾아보세요'}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {words.map((item, i) => (
                <button
                  key={item.word}
                  type="button"
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                  className={`story-ui-rise rounded-2xl border-[3px] p-4 text-left ${pressable} ${focusRing} ${selected === i ? 'border-[#2a1b12] bg-[#fff1d6] shadow-[0_4px_0_#2a1b12]' : 'border-[#e3d3bd] bg-white hover:border-[#2a1b12]/60'}`}
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <span lang="en" className="block text-2xl font-black">{item.word}</span>
                  <span className="mt-0.5 block text-base font-bold text-[#a08466]">{item.ko}</span>
                </button>
              ))}
            </div>
            {example ? (
              <div key={selected} className="story-ui-rise mt-4 rounded-2xl bg-[#fff1d6] p-4">
                <p className="text-xs font-black text-[#d0741f]">이야기 속 문장</p>
                <p lang="en" className="mt-1 text-lg font-bold leading-7"><HighlightWords text={example.en} words={[words[selected ?? 0].word]} /></p>
                <p className="mt-1 text-sm font-semibold text-[#8a6a4a]">{example.ko}</p>
                {narrated ? <>
                  <button type="button" onClick={() => player.jump(chapter.sentences.indexOf(example))} className={`${secondaryButton} mt-3`}>
                    <Play className="h-4 w-4" aria-hidden />예문 듣기
                  </button>
                  <AudioNotice player={player} />
                </> : null}
              </div>
            ) : (
              <p className="mt-4 flex items-start gap-2 text-sm font-bold leading-6 text-[#8a6a4a]">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />단어를 누르면 장면에서 반짝여요. 그림을 눌러도 단어를 찾을 수 있어요.
              </p>
            )}
          </>
        )}
      </Panel>
    </>
  );
}

function QuizStep({ storyId, narrated, chapter, Scene, mood, initialAnswer, onAnswer, isLast, onNext }: {
  storyId: string; narrated: boolean; chapter: StoryChapter; Scene: SceneComponent; mood: Mood; initialAnswer?: number; onAnswer: (correct: boolean, choice: number) => void; isLast: boolean; onNext: () => void;
}) {
  const player = useNarration(storyId, narrated, chapter, 'normal', undefined, true);
  const [chosen, setChosen] = useState<number | null>(initialAnswer ?? null);
  const quiz = chapter.quiz;
  const evidence = chapter.sentences[quiz.evidence];
  const answered = chosen !== null;
  const correct = chosen === quiz.answer;
  const beat = answered ? evidence.beat : chapter.sentences[chapter.sentences.length - 1].beat;

  const choose = (index: number) => {
    if (answered) return;
    setChosen(index);
    onAnswer(index === quiz.answer, index);
    if (narrated) player.jump(quiz.evidence);
  };

  return (
    <>
      <StagePane>
        <StoryStage
          Scene={Scene}
          beat={beat}
          bubble={answered ? evidence.bubble : undefined}
          atmosphere={answered && correct ? { ...mood(beat), particles: 'confetti' } : mood(beat)}
          label={`${chapter.titleKo} 장면`}
        >
          {answered ? (
            <div className="story-ui-rise pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#140c05]/90 via-[#140c05]/60 to-transparent px-6 pb-6 pt-20 text-center sm:px-12">
              <p className="mb-2 inline-block rounded-full border-2 border-[#2a1b12] bg-[#f6bd62] px-3 py-1 text-sm font-black text-[#2a1b12]">이 문장에 답이 있어요</p>
              <p lang="en" className="text-2xl font-black leading-snug text-white sm:text-[1.8rem]">{evidence.en}</p>
              <p className="mt-2 text-lg font-bold text-[#ffe2b0]">{evidence.ko}</p>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="story-title-in rounded-full border-[3px] border-[#2a1b12] bg-white px-7 py-3 text-xl font-black text-[#2a1b12] shadow-[0_5px_0_#2a1b12]">이야기를 떠올려 보세요</span>
            </div>
          )}
          {answered && correct ? (
            <p className="story-cheer pointer-events-none absolute left-1/2 top-[30%] rounded-full border-[3px] border-[#2a1b12] bg-[#ffd84d] px-8 py-3 text-3xl font-black text-[#2a1b12] shadow-[0_6px_0_#2a1b12]">
              Correct!
            </p>
          ) : null}
        </StoryStage>
      </StagePane>
      <Panel
        step="quiz"
        narrated={narrated}
        footer={<button type="button" onClick={onNext} disabled={!answered} className={`${primaryButton} w-full`}>{isLast ? '이야기 마무리' : '다음 장으로'}<ChevronRight className="h-5 w-5" aria-hidden /></button>}
      >
        {answered && narrated ? <>
          <button type="button" onClick={() => player.jump(quiz.evidence)} className={`${secondaryButton} mb-3`}>
            <Play className="h-4 w-4" aria-hidden />근거 문장 듣기
          </button>
          <AudioNotice player={player} />
        </> : null}
        <p lang="en" className="text-2xl font-black leading-snug">{quiz.question}</p>
        <p className="mt-1 text-base font-bold text-[#a08466]">{quiz.questionKo}</p>
        <div className="mt-4 space-y-2.5">
          {quiz.options.map((option, i) => {
            const state = !answered ? 'idle' : i === quiz.answer ? 'right' : i === chosen ? 'wrong' : 'dim';
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(i)}
                disabled={answered && state === 'dim'}
                aria-pressed={chosen === i}
                className={`flex w-full items-center gap-3 rounded-2xl border-[3px] p-4 text-left text-lg font-extrabold ${pressable} ${focusRing} ${state === 'right'
                  ? 'border-[#2a1b12] bg-[#eaf5e8] text-[#2f6b3e] shadow-[0_4px_0_#2a1b12]'
                  : state === 'wrong' ? 'story-ui-shake border-[#2a1b12] bg-[#fcebe6] text-[#a1402c] shadow-[0_4px_0_#2a1b12]'
                    : 'border-[#e3d3bd] bg-white hover:border-[#2a1b12]/60'}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#2a1b12] text-base font-black ${state === 'right' ? 'bg-[#5fb36f] text-white' : state === 'wrong' ? 'bg-[#d0705a] text-white' : 'bg-[#f1e4d2] text-[#8a6440]'}`}>
                  {state === 'right' ? <Check className="h-5 w-5" strokeWidth={3} aria-hidden /> : state === 'wrong' ? <X className="h-5 w-5" strokeWidth={3} aria-hidden /> : String.fromCharCode(65 + i)}
                </span>
                <span lang="en">{option}</span>
              </button>
            );
          })}
        </div>
        {answered ? (
          <div role="status" className={`story-ui-rise mt-4 rounded-2xl p-4 ${correct ? 'bg-[#eaf5e8]' : 'bg-[#fff1d6]'}`}>
            <p className={`text-lg font-black ${correct ? 'text-[#2f6b3e]' : 'text-[#a1402c]'}`}>{correct ? '정답이에요!' : '아쉬워요. 정답을 함께 볼까요?'}</p>
            <p className="mt-1 text-base font-semibold leading-7 text-[#5a3d22]">{quiz.explainKo}</p>
          </div>
        ) : null}
      </Panel>
    </>
  );
}

function RelistenStep({ storyId, narrated, chapter, Scene, mood, speed, isLast, onNext }: {
  storyId: string; narrated: boolean; chapter: StoryChapter; Scene: SceneComponent; mood: Mood; speed: ReadingSpeed; isLast: boolean; onNext: () => void;
}) {
  const player = useNarration(storyId, narrated, chapter, speed);
  const listRef = useRef<HTMLOListElement | null>(null);
  const { play } = player;
  const sentence = chapter.sentences[player.index];
  const words = useMemo(() => chapter.words.map((item) => item.word), [chapter]);

  useEffect(() => {
    const timer = window.setTimeout(play, 700);
    return () => window.clearTimeout(timer);
  }, [play]);

  useEffect(() => {
    const item = listRef.current?.children[player.index] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [player.index]);

  return (
    <>
      <StagePane>
        <StoryStage Scene={Scene} beat={sentence.beat} bubble={sentence.bubble} atmosphere={mood(sentence.beat)} label={`${chapter.titleKo} 장면`}
          tapLabel={(id) => hotspotWord(chapter, id)}>
          {narrated ? null : <Subtitle en={sentence.en} ko={sentence.ko} mode="both" />}
          {narrated ? <div className="absolute bottom-5 left-5 flex items-center gap-3">
            <button
              type="button"
              aria-label={(player.playing || player.loading) ? '일시정지' : '재생'}
              onClick={() => ((player.playing || player.loading) ? player.pause() : player.play())}
              className={`flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-[#2a1b12] bg-white text-[#d0741f] shadow-[0_5px_0_#2a1b12] ${pressable} ${focusRing}`}
            >
              {(player.playing || player.loading) ? <Pause className="h-8 w-8" aria-hidden /> : <Play className="ml-1 h-8 w-8" aria-hidden />}
            </button>
            <button type="button" aria-label="처음부터 다시" onClick={() => player.jump(0)} className={roundButton}>
              <RotateCcw className="h-5 w-5" aria-hidden />
            </button>
          </div> : null}
        </StoryStage>
      </StagePane>
      <Panel
        step="relisten"
        narrated={narrated}
        footer={<button type="button" onClick={onNext} className={`${primaryButton} w-full`}>
          {isLast ? '이야기 마무리' : '다음 장으로'}<ChevronRight className="h-5 w-5" aria-hidden />
        </button>}
      >
        {narrated ? <AudioNotice player={player} /> : null}
        <ol ref={listRef} className="space-y-2">
          {chapter.sentences.map((item, i) => {
            const active = i === player.index;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => player.jump(i)}
                  aria-current={active ? 'true' : undefined}
                  className={`w-full rounded-2xl border-[3px] p-3.5 text-left ${pressable} ${focusRing} ${active ? 'border-[#2a1b12] bg-[#fff1d6] shadow-[0_4px_0_#2a1b12]' : 'border-transparent hover:bg-[#f7ecdc]'}`}
                >
                  <p lang="en" className={`text-lg font-bold leading-7 ${active ? 'text-[#2a1b12]' : 'text-[#8a6a4a]'}`}>
                    <HighlightWords text={item.en} words={words} />
                  </p>
                  <p className={`mt-1 text-sm font-semibold ${active ? 'text-[#8a5a24]' : 'text-[#b39a80]'}`}>{item.ko}</p>
                </button>
              </li>
            );
          })}
        </ol>
      </Panel>
    </>
  );
}

function Recap({ story, results, Scene, onRestart, onLibrary, onClose }: {
  story: Story; results: Record<string, ChapterResult>; Scene: SceneComponent;
  onRestart: () => void; onLibrary: () => void; onClose: () => void;
}) {
  const correct = story.chapters.filter((item) => results[item.id]?.quiz === true).length;
  const words = story.chapters.reduce((sum, item) => sum + (results[item.id]?.words ? item.words.length : 0), 0);
  const finale = story.chapters[story.chapters.length - 1];
  return (
    <>
      <StagePane>
        <StoryStage Scene={Scene} beat={finale.sentences[finale.sentences.length - 1].beat} atmosphere={{ particles: 'confetti', grade: 'rgba(255, 176, 92, 0.2)', blend: 'soft-light' }} label="이야기의 마지막 장면" intro>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-8">
            <p className="story-title-in rounded-full border-[4px] border-[#2a1b12] bg-white px-10 py-3 font-serif text-5xl font-black italic text-[#2a1b12] shadow-[0_6px_0_#2a1b12]">The End</p>
          </div>
        </StoryStage>
      </StagePane>
      <Panel
        footer={(
          <div className="grid gap-3">
            <button type="button" onClick={onRestart} className={`${primaryButton} w-full`}><RotateCcw className="h-5 w-5" aria-hidden />{story.narration === 'recorded' ? '처음부터 다시 듣기' : '처음부터 다시 읽기'}</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onLibrary} className={secondaryButton}><Library className="h-4 w-4" aria-hidden />다른 이야기</button>
              <button type="button" onClick={onClose} className={secondaryButton}>끝내기</button>
            </div>
          </div>
        )}
      >
        <div className="story-ui-rise text-center">
          <Trophy className="mx-auto h-12 w-12 text-[#e0913a]" aria-hidden />
          <p className="mt-2 text-lg font-black text-[#a08466]">{story.titleKo}</p>
          <p className="text-2xl font-black">{story.narration === 'recorded' ? '이야기를 끝까지 들었어요!' : '이야기를 끝까지 읽었어요!'}</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border-[3px] border-[#2a1b12] bg-white p-4 text-center shadow-[0_4px_0_#2a1b12]">
            <p className="text-sm font-black text-[#a08466]">문맥 이해</p>
            <p className="mt-1 text-3xl font-black text-[#d0741f]">{correct}<span className="text-lg text-[#b39a80]"> / {story.chapters.length}</span></p>
          </div>
          <div className="rounded-2xl border-[3px] border-[#2a1b12] bg-white p-4 text-center shadow-[0_4px_0_#2a1b12]">
            <p className="text-sm font-black text-[#a08466]">찾은 단어</p>
            <p className="mt-1 text-3xl font-black text-[#d0741f]">{words}<span className="text-lg text-[#b39a80]">개</span></p>
          </div>
        </div>
        <ol className="mt-5 space-y-1.5">
          {story.chapters.map((item, i) => {
            const quiz = results[item.id]?.quiz;
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2">
                <span className="w-5 text-right text-sm font-black text-[#d0741f]">{i + 1}</span>
                <span className="flex-1 truncate font-extrabold">{item.titleKo}</span>
                <span className={`text-sm font-black ${quiz === true ? 'text-[#3f8a52]' : quiz === false ? 'text-[#b5452f]' : 'text-[#b39a80]'}`}>
                  {quiz === true ? '정답' : quiz === false ? '다시 보기' : '건너뜀'}
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </>
  );
}
