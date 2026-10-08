export type FeelingChoice = { en: string; ko: string; face: string };

/** A moment where the story waits for the learner to act on the scene. */
export type StoryAction = {
  /** tap: press the target; hold: press and keep pressing; rub: drag across it; feel: pick how a character feels. */
  kind: 'tap' | 'hold' | 'rub' | 'feel';
  /** Hotspot to act on (or the character to read, for feel); it must be visible in the previous sentence's beat. */
  target: string;
  /** Taps needed (tap only). */
  count?: number;
  /** Feeling options and the fitting one (feel only). */
  choices?: readonly FeelingChoice[];
  answer?: number;
  promptEn: string;
  promptKo: string;
};

export type StorySentence = {
  en: string;
  ko: string;
  /** Scene animation stage shown while this sentence is read. */
  beat: number;
  /** Short line shown in a speech bubble inside the scene. */
  bubble?: { speaker: string; text: string };
  /** The story pauses before this sentence until the learner does this. */
  action?: StoryAction;
};

export type StoryWord = {
  word: string;
  ko: string;
  /** Scene object that lights up and can be tapped for this word. */
  hotspot?: string;
  /** Scene stage where the hotspot is visible. */
  beat: number;
};

export type StoryQuiz = {
  question: string;
  questionKo: string;
  options: readonly string[];
  answer: number;
  /** Sentence index that holds the answer, replayed after answering. */
  evidence: number;
  explainKo: string;
};

export type StoryChapter = {
  id: string;
  title: string;
  titleKo: string;
  sentences: readonly StorySentence[];
  words: readonly StoryWord[];
  quiz: StoryQuiz;
};

export type Story = {
  id: string;
  title: string;
  titleKo: string;
  summaryKo: string;
  /** Shown on the library card: level, intended age and where the story comes from. */
  levelKo: string;
  ageKo: string;
  sourceKo: string;
  /** Cover line about the hands-on moments. */
  handsOnKo: string;
  /** Scene the cover loops through. */
  cover: { chapterId: string; beats: readonly number[] };
  /**
   * recorded: reviewed clips in the audio manifest drive the story.
   * pending: no recordings yet, so the learner turns each sentence by touch.
   */
  narration: 'recorded' | 'pending';
  chapters: readonly StoryChapter[];
};

export const STORY_STEPS = ['listen', 'words', 'quiz', 'relisten'] as const;
export type StoryStep = typeof STORY_STEPS[number];

export const STORY_STEP_META: Record<StoryStep, { label: string; hint: string }> = {
  listen: { label: '듣기', hint: '그림을 보며 이야기를 들어요' },
  words: { label: '듣기 학습', hint: '장면 속 핵심 단어를 찾아요' },
  quiz: { label: '문맥 이해', hint: '이야기 내용을 떠올려요' },
  relisten: { label: '다시 듣기', hint: '글과 함께 다시 들어요' },
};
