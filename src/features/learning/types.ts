export type LessonStage =
  | 'EXPRESSION_INTRO' | 'REPEAT_READY' | 'REPEAT_ASSESSING' | 'REPEAT_FEEDBACK'
  | 'APPLY_PROMPT' | 'APPLY_READY' | 'APPLY_ASSESSING' | 'RELEARN'
  | 'RETEST_PROMPT' | 'RETEST_READY' | 'RETEST_ASSESSING' | 'RESULT' | 'COMPLETED';

export type AttemptPurpose = 'REPEAT' | 'APPLY' | 'RETEST';

export type LessonExpressionView = {
  id: string;
  position: number;
  required: boolean;
  status: string;
  text: string;
  meaningKo: string;
  usageKo: string;
  hintLevel: 'NONE' | 'MEANING' | 'FIRST_WORD' | 'FULL_EXPRESSION';
  firstWord: string;
  lastFailureCode?: string | null;
};

export type LearningSnapshot = {
  type: 'learning_state';
  lessonSessionId: string;
  revision: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  stage: LessonStage;
  topic: { id: 'restaurant' | 'airport'; labelKo: string };
  unit: { id: string; goalKo: string };
  expressions: LessonExpressionView[];
  currentExpressionId: string | null;
  allowedActions: string[];
  activeAttempt?: { attemptId: string; purpose: AttemptPurpose } | null;
  scenario?: { id: string; purpose: AttemptPurpose; prompt: string; promptKo: string } | null;
  feedback?: { code: string; messageKo: string } | null;
  result?: { expressions: Array<{ id: string; outcome: string }> } | null;
};

export type LearningTopic = {
  id: 'restaurant' | 'airport';
  labelKo: string;
  goalKo: string;
  expressionCount: number;
};
