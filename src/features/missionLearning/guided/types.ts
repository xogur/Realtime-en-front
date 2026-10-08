import { isTopicId } from '@/lib/conversationTopics';

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type GuidedLevel = typeof LEVELS[number];
export const PHASES = ['DEMO', 'REHEARSE', 'GUIDED', 'TRANSFER', 'RECAP'] as const;
export const ACTIONS = ['START_PREP', 'SKIP_PREP', 'END_LESSON', 'FINISH', 'ABANDON', 'SELECT_CHOICE', 'NEXT_NODE', 'SKIP_NODE', 'RETRY_NODE', 'SHOW_SUPPORT', 'REDUCE_SUPPORT', 'PLAY_MODEL', 'REPLAY_LESSON', 'START_NEXT_LESSON', 'BEGIN_FREE_TALK'] as const;
export type GuidedAction = typeof ACTIONS[number];
export type Support = 'NONE' | 'CUE' | 'FRAME' | 'MODEL';
export type GuidedSnapshot = {
  type: 'learning_mission_state'; contractVersion: 2;
  sessionId: string; kioskId: string; lessonId: string; contentVersion: string;
  level: GuidedLevel; stage: 'BRIEF' | 'PREP' | 'ROLEPLAY' | 'FEEDBACK' | 'SUMMARY' | 'COMPLETED' | 'ABANDONED';
  revision: number; receiptRevision?: number; allowedActions: GuidedAction[];
  guided: null | {
    phase: typeof PHASES[number]; nodeId: string; attemptId: string;
    inputState: 'LOCKED' | 'READY' | 'PROCESSING';
    audioOwner: 'NONE' | 'MODEL' | 'COACH' | 'ROLE';
    intentKo: string; promptEn?: string; promptKo?: string; audioId?: string;
    supportVisible: Support; supportExposure: Support;
    display: { frameEn?: string; modelEn?: string; cueEn?: string; meaningKo?: string; contentCues: string[]; demo?: Array<{ speaker: string; text: string; meaningKo: string }> };
    choices: Array<{ id: string; labelEn: string }>; selectedChoiceId: string | null;
    stallCount: number; attemptCount: number;
    voiceStarted?: boolean; captureEpoch?: number; controllerEpoch?: number;
    retryRequested?: boolean;
    turnStatus?: 'NONE' | 'CAPTURING' | 'ASSESSING';
    recoveryReason?: null | 'NO_SPEECH' | 'NO_FINAL' | 'VOICE_NOT_READY';
    outcome: null | { meaningStatus: string; inputKind: string; recognitionStatus: string; supportExposure: Support; replyEn?: string; coachKo?: string; said?: string; sceneResultKo?: string };
  };
  recap: null | { observations: Array<{ textKo: string; said?: string }>; freeTalkAvailable: boolean; nextLessons: Array<{ id: string; titleKo: string }>; changeKo?: string; nextPracticeKo?: string; expressionEn?: string };
  handoff: null | { id: string; expiresAt: string; topicId: string; openerId: string; difficultyId: string; status: 'PREPARED' | 'STARTING' | 'COMPLETE' | 'FAILED' };
  titleKo?: string; canDoKo?: string;
  endReason: string | null;
};
export type GuidedHome = {
  contractVersion: 2; contentVersion: string; levels: Array<{ id: GuidedLevel; labelKo: string; available: boolean }>;
  profile: null | { level: GuidedLevel; revision: number };
  lessons: Array<{ id: string; titleKo: string; level: GuidedLevel; canDoKo?: string; topicId?: string; targetSeconds?: number; available?: boolean }>;
  activeSessionId: string | null;
};

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const member = (v: unknown, values: readonly string[]) => str(v) && values.includes(v);
const optionalString = (v: unknown) => v === undefined || str(v);
const supports = ['NONE', 'CUE', 'FRAME', 'MODEL'];

/** Reject unknown contracts/enums before rendering or starting capture. */
export function parseGuidedSnapshot(value: unknown): GuidedSnapshot | null {
  if (!obj(value) || value.type !== 'learning_mission_state' || value.contractVersion !== 2
    || !['sessionId', 'kioskId', 'lessonId', 'contentVersion'].every(k => str(value[k]) && !!value[k])
    || !member(value.level, LEVELS) || !integer(value.revision) || value.revision < 1
    || !member(value.stage, ['BRIEF', 'PREP', 'ROLEPLAY', 'FEEDBACK', 'SUMMARY', 'COMPLETED', 'ABANDONED'])
    || !Array.isArray(value.allowedActions) || !value.allowedActions.every(v => member(v, ACTIONS))) return null;
  const g = value.guided;
  const inactive = ['BRIEF', 'COMPLETED', 'ABANDONED'].includes(value.stage as string);
  if (inactive ? g !== null : !obj(g)) return null;
  if (obj(g)) {
    if (!member(g.phase, PHASES) || !str(g.nodeId) || !str(g.attemptId)
      || !member(g.inputState, ['LOCKED', 'READY', 'PROCESSING'])
      || !member(g.audioOwner, ['NONE', 'MODEL', 'COACH', 'ROLE'])
      || !str(g.intentKo) || !optionalString(g.promptEn) || !optionalString(g.promptKo) || !optionalString(g.audioId)
      || !(g.voiceStarted === undefined || typeof g.voiceStarted === 'boolean')
      || !(g.retryRequested === undefined || typeof g.retryRequested === 'boolean')
      || !(g.turnStatus === undefined || member(g.turnStatus, ['NONE', 'CAPTURING', 'ASSESSING']))
      || !(g.recoveryReason === undefined || g.recoveryReason === null || member(g.recoveryReason, ['NO_SPEECH', 'NO_FINAL', 'VOICE_NOT_READY']))
      || !['captureEpoch', 'controllerEpoch'].every(k => g[k] === undefined || integer(g[k]))
      || !member(g.supportVisible, supports) || !member(g.supportExposure, supports)
      || !integer(g.stallCount) || !integer(g.attemptCount)
      || !obj(g.display) || !Array.isArray(g.display.contentCues) || !g.display.contentCues.every(str)
      || !['frameEn', 'modelEn', 'cueEn', 'meaningKo'].every(k => optionalString((g.display as Record<string, unknown>)[k]))
      || !Array.isArray(g.choices) || !g.choices.every(c => obj(c) && str(c.id) && str(c.labelEn))
      || !(g.selectedChoiceId === null || str(g.selectedChoiceId))) return null;
    if (g.display.demo !== undefined && (!Array.isArray(g.display.demo) || !g.display.demo.every(d => obj(d) && str(d.speaker) && str(d.text) && str(d.meaningKo)))) return null;
    if (g.supportVisible !== 'MODEL' && g.display.modelEn !== undefined) return null;
    if (['NONE', 'CUE'].includes(g.supportVisible as string) && g.display.frameEn !== undefined) return null;
    if (g.supportVisible === 'NONE' && g.display.cueEn !== undefined) return null;
    if (g.outcome !== null && (!obj(g.outcome)
      || !member(g.outcome.meaningStatus, ['MET', 'PARTIAL', 'UNKNOWN', 'OFF_TOPIC', 'SKIPPED'])
      || !member(g.outcome.inputKind, ['SPEECH', 'TYPED'])
      || !member(g.outcome.recognitionStatus, ['CLEAR', 'CORRECTED', 'UNCERTAIN'])
      || !member(g.outcome.supportExposure, supports)
      || !['replyEn', 'coachKo', 'said', 'sceneResultKo'].every(k => optionalString((g.outcome as Record<string, unknown>)[k])))) return null;
  }
  if (value.recap !== null && (!obj(value.recap) || !Array.isArray(value.recap.observations)
    || !value.recap.observations.every(o => obj(o) && str(o.textKo) && optionalString(o.said))
    || typeof value.recap.freeTalkAvailable !== 'boolean' || !Array.isArray(value.recap.nextLessons)
    || !value.recap.nextLessons.every(l => obj(l) && str(l.id) && str(l.titleKo))
    || !['changeKo', 'nextPracticeKo', 'expressionEn'].every(k => optionalString((value.recap as Record<string, unknown>)[k])))) return null;
  if (value.handoff !== null && (!obj(value.handoff) || !['id', 'expiresAt', 'topicId', 'openerId', 'difficultyId'].every(k => str((value.handoff as Record<string, unknown>)[k]))
    || !isTopicId(value.handoff.topicId) || !member(value.handoff.difficultyId, LEVELS)
    || !member(value.handoff.status, ['PREPARED', 'STARTING', 'COMPLETE', 'FAILED']))) return null;
  if (!optionalString(value.titleKo) || !optionalString(value.canDoKo)) return null;
  if (!(value.endReason === null || str(value.endReason))) return null;
  return value as GuidedSnapshot;
}

export function parseGuidedHome(value: unknown): GuidedHome | null {
  if (!obj(value) || value.contractVersion !== 2 || !str(value.contentVersion)
    || !Array.isArray(value.levels) || !value.levels.every(l => obj(l) && member(l.id, LEVELS) && str(l.labelKo) && typeof l.available === 'boolean')
    || !(value.activeSessionId === null || str(value.activeSessionId))
    || !(value.profile === null || (obj(value.profile) && member(value.profile.level, LEVELS) && integer(value.profile.revision)))
    || !Array.isArray(value.lessons) || !value.lessons.every(l => obj(l) && str(l.id) && str(l.titleKo) && member(l.level, LEVELS)
      && optionalString(l.canDoKo) && (l.topicId === undefined || isTopicId(l.topicId)))) return null;
  return value as GuidedHome;
}
