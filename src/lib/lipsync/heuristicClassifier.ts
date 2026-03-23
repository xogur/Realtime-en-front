import type { AudioFeatures, HeuristicVisemeGuess, SpeechState, VisemeId } from './types';

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function classifyHeuristicViseme(features: AudioFeatures, speechState: SpeechState): HeuristicVisemeGuess {
  const [b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0] = features.bandRatios;
  const openness = clamp01(features.envelope * 1.15 + b2 * 0.2 + b3 * 0.25);
  const roundness = clamp01(b1 * 0.85 + b2 * 0.4);
  const spread = clamp01(b4 * 0.65 + b5 * 0.75);
  const lipPress = clamp01(
    Math.max(0, features.envelopeDelta) * 2.2 +
      (speechState.phase === 'onset' || speechState.phase === 'release' ? 0.15 : 0),
  );

  let primary: VisemeId = 'viseme_sil';
  let secondary: VisemeId | undefined;

  if (speechState.phase === 'silence' || speechState.phase === 'pause') {
    primary = 'viseme_sil';
  } else if (lipPress > 0.35) {
    primary = 'viseme_PP';
    secondary = features.voicedConfidence > 0.45 ? 'viseme_nn' : 'viseme_sil';
  } else if (b6 > 0.3 && features.zcr > 0.12) {
    primary = 'viseme_SS';
    secondary = 'viseme_CH';
  } else if (b5 > 0.24 && features.voicedConfidence < 0.42) {
    primary = 'viseme_CH';
    secondary = 'viseme_SS';
  } else if (b1 > 0.34 && roundness > 0.38) {
    primary = roundness > 0.5 ? 'viseme_U' : 'viseme_O';
    secondary = primary === 'viseme_U' ? 'viseme_O' : 'viseme_U';
  } else if (spread > 0.3) {
    primary = b5 > b4 ? 'viseme_I' : 'viseme_E';
    secondary = primary === 'viseme_I' ? 'viseme_E' : 'viseme_I';
  } else if (speechState.phase === 'consonant') {
    primary = features.voicedConfidence > 0.5 ? 'viseme_DD' : 'viseme_kk';
    secondary = features.voicedConfidence > 0.5 ? 'viseme_nn' : 'viseme_SS';
  } else {
    primary = 'viseme_aa';
    secondary = b4 > 0.2 ? 'viseme_E' : undefined;
  }

  let primaryWeight = clamp01(0.5 + features.envelope * 0.45 + features.voicedConfidence * 0.15);
  let secondaryWeight = secondary ? clamp01(0.18 + Math.abs(roundness - spread) * 0.2) : 0;

  if (primary === 'viseme_sil') {
    primaryWeight = 1;
    secondaryWeight = 0;
  } else if (secondaryWeight > 0.45) {
    secondaryWeight = 0.45;
  }

  return {
    phase: speechState.phase,
    primary,
    primaryWeight,
    secondary,
    secondaryWeight: secondary ? secondaryWeight : undefined,
    openness,
    roundness,
    spread,
    lipPress,
    confidence: clamp01(primaryWeight * 0.7 + features.voicedConfidence * 0.3),
  };
}
