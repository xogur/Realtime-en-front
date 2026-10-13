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
  optionsKo: readonly string[];
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
   * pending: no recordings yet, so the avatar cannot tell it and it is not offered.
   */
  narration: 'recorded' | 'pending';
  chapters: readonly StoryChapter[];
};
