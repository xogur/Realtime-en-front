export const BAND_RANGES_HZ = [
  [80, 250],
  [250, 500],
  [500, 900],
  [900, 1600],
  [1600, 3000],
  [3000, 6000],
] as const;

export const SPEECH_THRESHOLDS = {
  on: 0.06,
  off: 0.035,
  onsetHoldMs: 45,
  minVisemeDwellMs: 50,
  pauseEnterMs: 80,
  silenceSettleMs: 140,
} as const;

export const DEFAULT_SAMPLE_RATE = 48000;

export const TIMELINE_LOOKAHEAD_MS = 70;

export const VOWEL_VISEMES = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U'] as const;
