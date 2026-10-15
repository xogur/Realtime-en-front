import { create } from 'zustand';

import { stripKoreanFillers } from '@/lib/koreanFillers';

/*
 * Chapter comprehension check messages from the server (story_check_*). The
 * server owns questions, scoring and the decision; this store only keeps the
 * latest valid message per kind for the avatar screen. Unknown shapes are
 * dropped so a malformed message can never move the story.
 */

export type StoryCheckPromptKind = 'question' | 'follow_up' | 'choices';
export type StoryCheckDecisionKind = 'NEXT' | 'REPLAY_SLOW' | 'REPLAY_SLOW_EN' | 'REPLAY_SLOW_KO' | 'EXPLAIN_NEXT';

export type StoryCheckPrompt = {
  checkId: string;
  seq: number;
  attempt: number;
  kind: StoryCheckPromptKind;
  questionKo: string;
  speechKo: string;
  followUpKo?: string;
  choicesKo?: string[];
  index: number;
  total: number;
};

export type StoryCheckDecision = {
  checkId: string;
  seq: number;
  decision: StoryCheckDecisionKind;
  attempt: number;
  nextAttempt: number;
  speechKo: string;
};

export type StoryCheckSpeechDone = { checkId: string; seq: number; ok: boolean };
/** Server STT of an armed answer: partial while the child speaks, final once. */
export type StoryCheckTranscript = { checkId: string; seq: number; text: string; final: boolean; at: number };
export type StoryCheckFailure = { checkId: string | null; code: string; content: string };

export type StoryCheckAnswer =
  | { kind: 'speech'; text: string }
  | { kind: 'touch'; choiceIndex: number }
  | { kind: 'unknown' }
  | { kind: 'unavailable' };

const PROMPT_KINDS: readonly StoryCheckPromptKind[] = ['question', 'follow_up', 'choices'];
const DECISIONS: readonly StoryCheckDecisionKind[] = ['NEXT', 'REPLAY_SLOW', 'REPLAY_SLOW_EN', 'REPLAY_SLOW_KO', 'EXPLAIN_NEXT'];
const MAX_TEXT = 600;

function isText(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === 'string' && value.length <= max;
}

/** Last attempt of a chapter: normal, slower, + English subtitles, + Korean translation (server MAX_ATTEMPTS - 1). */
const LAST_ATTEMPT = 3;

function isCount(value: unknown, max = 1_000_000): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function isCheckId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

export function parseStoryCheckPrompt(data: Record<string, unknown>): StoryCheckPrompt | null {
  if (!isCheckId(data.checkId) || !isCount(data.seq) || !isCount(data.attempt, LAST_ATTEMPT)) return null;
  if (!PROMPT_KINDS.includes(data.kind as StoryCheckPromptKind) || !isText(data.questionKo, 200) || !isText(data.speechKo)) return null;
  if (!isCount(data.index, 10) || !isCount(data.total, 10)) return null;
  if (data.followUpKo !== undefined && !isText(data.followUpKo, 200)) return null;
  let choicesKo: string[] | undefined;
  if (data.choicesKo !== undefined) {
    if (!Array.isArray(data.choicesKo) || data.choicesKo.length < 2 || data.choicesKo.length > 4
      || !data.choicesKo.every((choice) => isText(choice, 80))) return null;
    choicesKo = data.choicesKo as string[];
  }
  if (data.kind === 'choices' && !choicesKo) return null;
  return {
    checkId: data.checkId, seq: data.seq, attempt: data.attempt, kind: data.kind as StoryCheckPromptKind,
    questionKo: data.questionKo, speechKo: data.speechKo, index: data.index, total: data.total,
    ...(typeof data.followUpKo === 'string' ? { followUpKo: data.followUpKo } : {}),
    ...(choicesKo ? { choicesKo } : {}),
  };
}

export function parseStoryCheckDecision(data: Record<string, unknown>): StoryCheckDecision | null {
  if (!isCheckId(data.checkId) || !isCount(data.seq) || !isCount(data.attempt, LAST_ATTEMPT) || !isCount(data.nextAttempt, LAST_ATTEMPT)) return null;
  if (!DECISIONS.includes(data.decision as StoryCheckDecisionKind) || !isText(data.speechKo)) return null;
  return {
    checkId: data.checkId, seq: data.seq, decision: data.decision as StoryCheckDecisionKind,
    attempt: data.attempt, nextAttempt: data.nextAttempt, speechKo: data.speechKo,
  };
}

export function parseStoryCheckSpeechDone(data: Record<string, unknown>): StoryCheckSpeechDone | null {
  if (!isCheckId(data.checkId) || !isCount(data.seq) || typeof data.ok !== 'boolean') return null;
  return { checkId: data.checkId, seq: data.seq, ok: data.ok };
}

export function parseStoryCheckTranscript(data: Record<string, unknown>, final: boolean): StoryCheckTranscript | null {
  if (!isCheckId(data.checkId) || !isCount(data.seq) || !isText(data.content, 300)) return null;
  return { checkId: data.checkId, seq: data.seq, text: data.content.trim(), final, at: Date.now() };
}

export function parseStoryCheckFailure(data: Record<string, unknown>): StoryCheckFailure | null {
  if (data.checkId !== null && data.checkId !== undefined && !isCheckId(data.checkId)) return null;
  if (!isText(data.code, 64)) return null;
  return {
    checkId: (data.checkId as string | undefined) ?? null,
    code: data.code,
    content: isText(data.content, 200) ? data.content : '확인 질문을 이어가지 못했어요.',
  };
}

type StoryCheckStore = {
  prompt: StoryCheckPrompt | null;
  decision: StoryCheckDecision | null;
  speechDone: StoryCheckSpeechDone | null;
  failure: StoryCheckFailure | null;
  transcript: StoryCheckTranscript | null;
  /** Applies one socket message; returns true when it was a valid story check message. */
  receive: (type: string, data: Record<string, unknown>) => boolean;
  clear: () => void;
};

export const useStoryCheckStore = create<StoryCheckStore>((set) => ({
  prompt: null,
  decision: null,
  speechDone: null,
  failure: null,
  transcript: null,
  receive: (type, data) => {
    if (type === 'story_check_prompt') {
      const prompt = parseStoryCheckPrompt(data);
      if (prompt) set({ prompt, decision: null, speechDone: null, failure: null });
      return Boolean(prompt);
    }
    if (type === 'story_check_decision') {
      const decision = parseStoryCheckDecision(data);
      if (decision) set({ decision, speechDone: null, failure: null });
      return Boolean(decision);
    }
    if (type === 'story_check_speech_done') {
      const speechDone = parseStoryCheckSpeechDone(data);
      if (speechDone) set({ speechDone });
      return Boolean(speechDone);
    }
    if (type === 'story_check_partial' || type === 'story_check_heard') {
      const transcript = parseStoryCheckTranscript(data, type === 'story_check_heard');
      if (transcript) set({ transcript });
      return Boolean(transcript);
    }
    if (type === 'story_check_error') {
      const failure = parseStoryCheckFailure(data);
      if (failure) set({ failure });
      return Boolean(failure);
    }
    return false;
  },
  clear: () => set({ prompt: null, decision: null, speechDone: null, failure: null, transcript: null }),
}));

export const STORY_CHECK_TYPES = new Set(['story_check_prompt', 'story_check_decision', 'story_check_speech_done', 'story_check_error', 'story_check_paused', 'story_check_partial', 'story_check_heard']);

/** Whether a decision moves on (and which listen comes next). */
export function nextListen(decision: StoryCheckDecisionKind): { advance: boolean; attempt: number } {
  if (decision === 'REPLAY_SLOW') return { advance: false, attempt: 1 };
  if (decision === 'REPLAY_SLOW_EN') return { advance: false, attempt: 2 };
  if (decision === 'REPLAY_SLOW_KO') return { advance: false, attempt: 3 };
  return { advance: true, attempt: 0 };
}

/** How a chapter is heard: narration speed, English subtitles, Korean translation. */
export type ListenSupport = { speed: 'normal' | 'slow'; english: boolean; korean: boolean };

/** Support for a missed chapter grows one step per replay: slower, then English subtitles, then the Korean translation. */
export function listenSupport(attempt: number): ListenSupport {
  return { speed: attempt >= 1 ? 'slow' : 'normal', english: attempt >= 2, korean: attempt >= 3 };
}

/** Digits and native ordinals ("2번", "두 번째") only ever mean a choice, wherever they are said. */
const ORDINALS: ReadonlyArray<RegExp> = [
  /(?<!\d)1번|첫(?:번)?째/,
  /(?<!\d)2번|두번째|둘째/,
  /(?<!\d)3번|세번째|셋째/,
  /(?<!\d)4번|네번째|넷째/,
];
/**
 * Sino-Korean numbers and counts are also everyday words ("이번엔 양이요" is
 * "this time, the sheep"), so they pick a choice only as the whole reply,
 * with at most a particle or ending ("이번이요", "둘", "정답은 삼번").
 */
const SPOKEN_ORDINALS: ReadonlyArray<RegExp> = [/^(?:일번|하나)/, /^(?:이번|둘)/, /^(?:삼번|셋)/, /^(?:사번|넷)/];
const ANSWER_PREFIX = /^(?:정답은|답은|저는|나는)/;
const ORDINAL_TAIL = /^(?:이|가|은|는|을|를|요|야|예|에|거|것|으로|로|이에요|에요|예요|입니다|이죠|죠|할게요)*$/;

function spokenOrdinal(said: string): number {
  const rest = said.replace(ANSWER_PREFIX, '');
  return SPOKEN_ORDINALS.findIndex((pattern) => {
    const match = rest.match(pattern);
    return Boolean(match) && ORDINAL_TAIL.test(rest.slice(match![0].length));
  });
}
/** Particles, endings and fillers that say nothing about which choice was meant. */
const NEUTRAL_SYLLABLES = new Set('이가은는을를에의요야예거것게그냥뿐일도만고어아음해했지네요'.split(''));

function compactKo(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Maps a spoken reply to a shown choice: a number ("2번", "두 번째") or words
 * that only one choice contains ("양이요"). Returns null when it is unclear,
 * so a vague reply never picks for the learner.
 */
export function matchSpokenChoice(text: string, choices: readonly string[]): number | null {
  const said = compactKo(stripKoreanFillers(text));
  if (!said) return null;
  const digit = ORDINALS.findIndex((pattern) => pattern.test(said));
  const byNumber = digit >= 0 ? digit : spokenOrdinal(said);
  if (byNumber >= 0) return byNumber < choices.length ? byNumber : null;
  const syllables = choices.map((choice) => new Set([...compactKo(choice)].filter((c) => !NEUTRAL_SYLLABLES.has(c))));
  const scores = syllables.map((own, index) => [...own].filter((c) => (
    said.includes(c) && syllables.every((other, j) => j === index || !other.has(c))
  )).length);
  const best = Math.max(...scores);
  if (best === 0 || scores.filter((score) => score === best).length > 1) return null;
  return scores.indexOf(best);
}
