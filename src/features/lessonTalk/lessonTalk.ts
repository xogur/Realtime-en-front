import { create } from 'zustand';

/*
 * Lesson talk messages from the server (lesson_talk_*). The server owns the lesson:
 * what the avatar says, what it waits for, judging and progress. This store keeps
 * the latest valid message per kind for the avatar screen; unknown shapes are
 * dropped so a malformed message can never move the lesson.
 */

export type LessonLine = { lang: 'ko' | 'en'; text: string; role: 'coach' | 'role' | 'model'; subtitleKo?: string; slow?: boolean };
export type LessonChoice = { id: string; label: string };
export type LessonExpect = { kind: 'speech' | 'choice' | 'none'; listenLang: 'ko' | 'en'; choices?: LessonChoice[] };
export type LessonProgress = {
  lessonId: string; titleKo: string; topicId: string; level: 'beginner' | 'intermediate' | 'advanced';
  turnIndex: number; turnTotal: number; expressionEn: string;
};
export type LessonWord = { en: string; ko: string };
export type LessonDisplay = {
  en?: string; ko?: string; model?: string; hintKo?: string; frame?: string;
  /** What to say next ("고맙다고 말해 봐."). */
  guideKo?: string;
  /** How the expression is used (beginners). */
  howKo?: string;
  /** Words the learner can use, with their meaning. */
  words?: LessonWord[];
};
export type LessonStage = 'level' | 'topic' | 'warmup' | 'turn' | 'next' | 'end';
export type LessonNext = 'LESSON' | 'FREE_TALK' | 'END';

export type LessonTurn = {
  talkId: string;
  seq: number;
  stage: LessonStage;
  lines: LessonLine[];
  expect: LessonExpect;
  progress: LessonProgress | null;
  display: LessonDisplay | null;
  end: { next: LessonNext; freeTalk?: { topicId: string; difficultyId: string } } | null;
};

export type LessonSpeechDone = { talkId: string; seq: number; ok: boolean };
export type LessonTranscript = { talkId: string; seq: number; text: string; final: boolean; at: number };
export type LessonFailure = { talkId: string | null; code: string; content: string };
export type LessonAnswer =
  | { kind: 'speech'; text: string }
  | { kind: 'touch'; choiceId: string }
  | { kind: 'silence' }
  | { kind: 'help' };

const STAGES: readonly LessonStage[] = ['level', 'topic', 'warmup', 'turn', 'next', 'end'];
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const NEXTS: readonly LessonNext[] = ['LESSON', 'FREE_TALK', 'END'];
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const SLUG = /^[a-z0-9_]{1,64}$/;
const MAX_LINES = 16;

function isText(value: unknown, max = 300): value is string {
  return typeof value === 'string' && value.length <= max;
}

function isCount(value: unknown, max = 1_000_000): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseLine(value: unknown): LessonLine | null {
  const line = record(value);
  if (!line || (line.lang !== 'ko' && line.lang !== 'en') || !isText(line.text) || !line.text.trim()) return null;
  if (line.role !== 'coach' && line.role !== 'role' && line.role !== 'model') return null;
  if (line.subtitleKo !== undefined && !isText(line.subtitleKo)) return null;
  return {
    lang: line.lang, text: line.text, role: line.role,
    ...(typeof line.subtitleKo === 'string' && line.subtitleKo ? { subtitleKo: line.subtitleKo } : {}),
    ...(line.slow === true ? { slow: true } : {}),
  };
}

function parseExpect(value: unknown): LessonExpect | null {
  const expect = record(value);
  if (!expect || (expect.kind !== 'speech' && expect.kind !== 'choice' && expect.kind !== 'none')) return null;
  if (expect.listenLang !== 'ko' && expect.listenLang !== 'en') return null;
  let choices: LessonChoice[] | undefined;
  if (expect.choices !== undefined) {
    if (!Array.isArray(expect.choices) || expect.choices.length < 1 || expect.choices.length > 4) return null;
    choices = [];
    for (const item of expect.choices) {
      const choice = record(item);
      if (!choice || typeof choice.id !== 'string' || !SLUG.test(choice.id) || !isText(choice.label, 120)) return null;
      choices.push({ id: choice.id, label: choice.label });
    }
  }
  if (expect.kind === 'choice' && !choices) return null;
  return { kind: expect.kind, listenLang: expect.listenLang, ...(choices ? { choices } : {}) };
}

function parseProgress(value: unknown): LessonProgress | null {
  const progress = record(value);
  if (!progress || !isText(progress.lessonId, 64) || !SLUG.test(progress.lessonId)) return null;
  if (!isText(progress.titleKo, 80) || !isText(progress.topicId, 32) || !LEVELS.includes(progress.level as never)) return null;
  if (!isCount(progress.turnIndex, 32) || !isCount(progress.turnTotal, 32) || !isText(progress.expressionEn, 200)) return null;
  return {
    lessonId: progress.lessonId, titleKo: progress.titleKo, topicId: progress.topicId,
    level: progress.level as LessonProgress['level'], turnIndex: progress.turnIndex, turnTotal: progress.turnTotal,
    expressionEn: progress.expressionEn,
  };
}

function parseDisplay(value: unknown): LessonDisplay | null {
  const display = record(value);
  if (!display) return null;
  const result: LessonDisplay = {};
  for (const key of ['en', 'ko', 'model', 'hintKo', 'frame', 'guideKo', 'howKo'] as const) {
    if (isText(display[key]) && display[key]) result[key] = display[key] as string;
  }
  if (Array.isArray(display.words)) {
    const words = display.words.slice(0, 6).map(record)
      .filter((word): word is Record<string, unknown> => Boolean(word && isText(word.en) && isText(word.ko) && word.en && word.ko))
      .map((word) => ({ en: word.en as string, ko: word.ko as string }));
    if (words.length) result.words = words;
  }
  return result;
}

export function parseLessonTurn(data: Record<string, unknown>, end = false): LessonTurn | null {
  if (typeof data.talkId !== 'string' || !ID.test(data.talkId) || !isCount(data.seq)) return null;
  if (!STAGES.includes(data.stage as LessonStage) || !Array.isArray(data.lines) || data.lines.length > MAX_LINES) return null;
  const lines = data.lines.map(parseLine);
  if (lines.some((line) => line === null)) return null;
  const expect = parseExpect(data.expect);
  if (!expect) return null;
  // Setup turns (level, topic) come before any lesson: their progress is empty.
  let progress: LessonProgress | null = null;
  if (data.progress !== undefined) {
    const raw = record(data.progress);
    if (!raw) return null;
    if (Object.keys(raw).length) {
      progress = parseProgress(raw);
      if (!progress) return null;
    }
  }
  let finish: LessonTurn['end'] = null;
  if (end) {
    if (!NEXTS.includes(data.next as LessonNext)) return null;
    const freeTalk = record(data.freeTalk);
    finish = {
      next: data.next as LessonNext,
      ...(freeTalk && isText(freeTalk.topicId, 32) && isText(freeTalk.difficultyId, 32)
        ? { freeTalk: { topicId: freeTalk.topicId, difficultyId: freeTalk.difficultyId } } : {}),
    };
  }
  return {
    talkId: data.talkId, seq: data.seq, stage: data.stage as LessonStage, lines: lines as LessonLine[], expect,
    progress, display: parseDisplay(data.display), end: finish,
  };
}

function parseScoped(data: Record<string, unknown>): { talkId: string; seq: number } | null {
  if (typeof data.talkId !== 'string' || !ID.test(data.talkId) || !isCount(data.seq)) return null;
  return { talkId: data.talkId, seq: data.seq };
}

export function parseLessonFailure(data: Record<string, unknown>): LessonFailure | null {
  if (data.talkId !== null && data.talkId !== undefined && (typeof data.talkId !== 'string' || !ID.test(data.talkId))) return null;
  if (!isText(data.code, 64)) return null;
  return {
    talkId: (data.talkId as string | undefined) ?? null,
    code: data.code,
    content: isText(data.content, 200) && data.content ? data.content : '학습을 이어가지 못했어요.',
  };
}

type LessonTalkStore = {
  turn: LessonTurn | null;
  speechDone: LessonSpeechDone | null;
  transcript: LessonTranscript | null;
  failure: LessonFailure | null;
  /** Applies one socket message; true when it was a valid lesson talk message. */
  receive: (type: string, data: Record<string, unknown>) => boolean;
  /** A lesson_talk_line for the current turn: the next generation's audio must be accepted. */
  isCurrentLine: (data: Record<string, unknown>) => boolean;
  clear: () => void;
};

export const useLessonTalkStore = create<LessonTalkStore>((set, get) => ({
  turn: null,
  speechDone: null,
  transcript: null,
  failure: null,
  receive: (type, data) => {
    if (type === 'lesson_talk_turn' || type === 'lesson_talk_end') {
      const turn = parseLessonTurn(data, type === 'lesson_talk_end');
      if (turn) set({ turn, speechDone: null, failure: null, transcript: null });
      return Boolean(turn);
    }
    if (type === 'lesson_talk_speech_done') {
      const scope = parseScoped(data);
      if (scope && typeof data.ok === 'boolean') set({ speechDone: { ...scope, ok: data.ok } });
      return Boolean(scope);
    }
    if (type === 'lesson_talk_partial' || type === 'lesson_talk_heard') {
      const scope = parseScoped(data);
      if (!scope || !isText(data.content)) return false;
      set({ transcript: { ...scope, text: data.content.trim(), final: type === 'lesson_talk_heard', at: Date.now() } });
      return true;
    }
    if (type === 'lesson_talk_error') {
      const failure = parseLessonFailure(data);
      if (failure) set({ failure });
      return Boolean(failure);
    }
    return type === 'lesson_talk_paused' || type === 'lesson_talk_line';
  },
  isCurrentLine: (data) => {
    const scope = parseScoped(data);
    const turn = get().turn;
    return Boolean(scope && turn && scope.talkId === turn.talkId && scope.seq === turn.seq);
  },
  clear: () => set({ turn: null, speechDone: null, transcript: null, failure: null }),
}));

/** Thinking sounds in either language; a pause after "um…" must not send that as the answer. */
const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'hmm', 'hm', 'mm', 'ah', 'oh', 'er', 'erm',
  '음', '음음', '으음', '흠', '어', '어어', '아', '그', '저', '저기']);

export function isFillerOnly(text: string): boolean {
  const words = text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => FILLERS.has(word));
}

/** How long the avatar waits for a first word before it helps (children need more time than adults). */
export function silenceMs(turn: LessonTurn | null): number {
  if (!turn) return 10_000;
  if (turn.expect.kind === 'choice') return 12_000;
  if (turn.expect.listenLang === 'ko') return 10_000;
  const level = turn.progress?.level ?? 'beginner';
  return level === 'advanced' ? 6_000 : level === 'intermediate' ? 7_000 : 9_000;
}
