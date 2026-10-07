export type AgeBand = 'child' | 'teen' | 'adult' | 'senior';
export type LearningLevel = 'intro' | 'basic' | 'applied';

export type MissionStage = 'BRIEF' | 'PREP' | 'ROLEPLAY' | 'FEEDBACK' | 'SUMMARY' | 'COMPLETED' | 'ABANDONED';

export type MissionAction =
  | 'START_PREP' | 'SKIP_PREP' | 'PLAY_EXPRESSION' | 'DONE_PREP' | 'SHOW_HELP_CARD'
  | 'END_ROLEPLAY' | 'CONTINUE' | 'START_NEXT_MISSION' | 'FINISH' | 'ABANDON';

export type UsageLevel = 'NONE' | 'LISTENED' | 'REPEATED' | 'WITH_CARD' | 'INDEPENDENT';
export type HelpStep = 'MEANING' | 'FIRST_WORD' | 'FULL_TEXT' | 'AUDIO';

export type LearnerProfile = { ageBand: AgeBand; level: LearningLevel; revision: number };

export type MissionCard = {
  id: string;
  courseOrder: number;
  titleKo: string;
  actionKo: string;
  goalKo: string;
  targetSeconds: number;
  completed: boolean;
};

export type MissionExpression = {
  id: string;
  usage: UsageLevel;
  helpStep: number;
  text?: string;
  meaningKo?: string;
  usageKo?: string;
  firstWord?: string;
  revealed?: HelpStep[];
};

export type GoalSlot = { id: string; labelKo: string; done: boolean };

export type FeedbackItem = {
  key: string;
  labelKo: string;
  band: 'GREAT' | 'DONE' | 'PRACTICE' | 'HELD';
  reasonKo?: string | null;
  /** The learner's own words the server verified, shown once. */
  evidence?: string | null;
};

export type FeedbackStatus = 'PENDING' | 'READY' | 'FALLBACK';

export type MissionSnapshot = {
  type: 'learning_mission_state';
  sessionId: string;
  kioskId: string;
  missionId: string;
  variant: string;
  contentVersion: string;
  stage: MissionStage;
  revision: number;
  allowedActions: MissionAction[];
  mission: {
    titleKo: string;
    actionKo: string;
    goalKo: string;
    situationKo: string;
    openingLine: string;
    targetSeconds: number;
    goalSlots: GoalSlot[];
  };
  expressions: MissionExpression[];
  roleplay: null | {
    elapsedSeconds: number;
    targetSeconds: number;
    hardCapSeconds: number;
    remainingSeconds: number;
    hardCapRemainingSeconds: number;
    ended: boolean;
    voiceStarted?: boolean;
    turns?: number;
    maxTurns?: number;
    clarificationHelp?: { slotId: string; askLine: string; answers: string[] } | null;
  };
  feedback: null | {
    rubricVersion: string;
    status?: FeedbackStatus;
    missionCompleted: boolean;
    slots: GoalSlot[];
    items: FeedbackItem[];
    highlights: string[];
    nextPracticeKo: string | null;
  };
  summary: null | {
    expressions: Array<{
      id: string; text: string; meaningKo: string; usage: UsageLevel; usageKo: string; said?: string;
      pronunciation?: { band: PronunciationBand; labelKo: string } | null;
    }>;
    nextMission: { id: string; titleKo: string; reasonKo?: string } | null;
    pronunciationPractice?: boolean;
  };
  transcript?: Array<{ role: 'avatar' | 'learner'; text: string }>;
  endReason: string | null;
};

export type PronunciationBand = 'GREAT' | 'DONE' | 'PRACTICE';

export type PronunciationResult = {
  status: 'OK' | 'RETRY' | 'UNAVAILABLE';
  band: PronunciationBand | null;
  labelKo: string;
  messageKo: string;
};

export type MissionLearningHomeDetail = {
  capabilities?: { guidedV2?: boolean };
  enabled: boolean;
  contractVersion: number;
  contentVersion: string;
  profileOptions: { ageBands: AgeBand[]; levels: LearningLevel[] };
  profile: LearnerProfile | null;
  missions: MissionCard[];
  recommendedMissionId: string | null;
  recommendation?: { missionId: string; kind: 'REVIEW' | 'COURSE'; reasonKo: string } | null;
  revisitKo?: string | null;
  activeSession: MissionSnapshot | null;
  entry?: { open: boolean; returnTo: 'mode' | null; seq: number } | null;
};

export class MissionLearningApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly snapshot?: MissionSnapshot,
  ) {
    super(message);
  }
}
