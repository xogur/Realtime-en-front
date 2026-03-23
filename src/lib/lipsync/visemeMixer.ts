import { VOWEL_VISEMES } from './constants';
import type {
  AudioFeatures,
  AvatarLipProfile,
  Emotion,
  HeuristicVisemeGuess,
  LipSyncMode,
  ResolvedVisemeFrame,
  SpeechPhase,
  TtsVisemeEvent,
  VisemeId,
} from './types';

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function addVisemeWeight(target: Partial<Record<VisemeId, number>>, viseme: VisemeId | undefined, weight: number) {
  if (!viseme || weight <= 0) return;
  target[viseme] = clamp01(Math.max(target[viseme] ?? 0, weight));
}

function getEmotionSmileWeight(emotion: Emotion) {
  switch (emotion) {
    case 'happy':
      return 0.35;
    case 'annoyed':
      return 0.08;
    default:
      return 0;
  }
}

function resolveBaseGuess(
  heuristic: HeuristicVisemeGuess,
  timelineEvent: TtsVisemeEvent | null,
  lookaheadEvent: TtsVisemeEvent | null,
): { phase: SpeechPhase; mode: LipSyncMode; primary: VisemeId; secondary?: VisemeId; primaryWeight: number; secondaryWeight: number; openness: number; roundness: number; spread: number; lipPress: number; confidence: number } {
  if (!timelineEvent) {
    return {
      phase: heuristic.phase,
      mode: 'heuristic',
      primary: heuristic.primary,
      secondary: heuristic.secondary,
      primaryWeight: heuristic.primaryWeight,
      secondaryWeight: heuristic.secondaryWeight ?? 0,
      openness: heuristic.openness,
      roundness: heuristic.roundness,
      spread: heuristic.spread,
      lipPress: heuristic.lipPress,
      confidence: heuristic.confidence,
    };
  }

  const openness = timelineEvent.openness ?? heuristic.openness;
  const roundness = timelineEvent.roundness ?? heuristic.roundness;
  const spread = timelineEvent.spread ?? heuristic.spread;
  const lipPress = timelineEvent.lipPress ?? heuristic.lipPress;

  const secondary = lookaheadEvent?.primary && lookaheadEvent.primary !== timelineEvent.primary
    ? lookaheadEvent.primary
    : timelineEvent.secondary;

  return {
    phase: timelineEvent.phase ?? heuristic.phase,
    mode: 'hybrid',
    primary: timelineEvent.primary,
    secondary,
    primaryWeight: timelineEvent.primaryWeight,
    secondaryWeight: timelineEvent.secondaryWeight ?? (secondary ? 0.18 : 0),
    openness,
    roundness,
    spread,
    lipPress,
    confidence: clamp01((timelineEvent.primaryWeight + heuristic.confidence) / 2),
  };
}

export function mixVisemeFrame({
  heuristic,
  timelineEvent,
  lookaheadEvent,
  profile,
  emotion,
  features,
}: {
  heuristic: HeuristicVisemeGuess;
  timelineEvent: TtsVisemeEvent | null;
  lookaheadEvent: TtsVisemeEvent | null;
  profile: AvatarLipProfile;
  emotion: Emotion;
  features: AudioFeatures;
}): ResolvedVisemeFrame {
  const base = resolveBaseGuess(heuristic, timelineEvent, lookaheadEvent);
  const visemeWeights: Partial<Record<VisemeId, number>> = {};

  addVisemeWeight(visemeWeights, base.primary, base.primaryWeight);
  addVisemeWeight(visemeWeights, base.secondary, base.secondaryWeight);

  if (base.primary === 'viseme_sil' || base.phase === 'silence' || base.phase === 'pause') {
    visemeWeights.viseme_sil = 1;
  }

  const openness = clamp01(base.openness * (0.6 + features.envelope * 0.6) + profile.mouthOpenBias);
  const roundness = Math.min(profile.fishLipClamp, clamp01(base.roundness * profile.roundnessMax));
  const spread = clamp01(base.spread * profile.spreadMax);
  const lipPress = clamp01(base.lipPress * profile.lipPressMax);

  const isRounded = base.primary === 'viseme_O' || base.primary === 'viseme_U';
  const isSpread = base.primary === 'viseme_E' || base.primary === 'viseme_I';
  const isVowel = VOWEL_VISEMES.includes(base.primary as (typeof VOWEL_VISEMES)[number]);

  const jawOpen = clamp01(
    profile.jawOpenBias +
      openness * profile.jawOpenMax * (isVowel ? 1 : 0.6) +
      (emotion === 'surprised' ? 0.08 : 0),
  );

  const smileBlend = getEmotionSmileWeight(emotion) * profile.smileMouthBlend;

  return {
    phase: base.phase,
    visemeWeights,
    jawOpen: base.primary === 'viseme_sil' ? 0 : jawOpen,
    mouthPucker: isRounded ? roundness : 0,
    mouthFunnel: base.primary === 'viseme_U' ? roundness * 0.85 : roundness * 0.45,
    mouthStretchLeft: isSpread ? spread + smileBlend : smileBlend,
    mouthStretchRight: isSpread ? spread + smileBlend : smileBlend,
    mouthPressLeft: lipPress,
    mouthPressRight: lipPress,
    mouthDimpleLeft: clamp01(lipPress * 0.4 + smileBlend * 0.6),
    mouthDimpleRight: clamp01(lipPress * 0.4 + smileBlend * 0.6),
    confidence: base.confidence,
    source: base.mode,
  };
}
