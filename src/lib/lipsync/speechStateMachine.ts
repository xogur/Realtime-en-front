import { SPEECH_THRESHOLDS } from './constants';
import type { AudioFeatures, HeuristicVisemeGuess, SpeechState } from './types';

export function createSpeechState(): SpeechState {
  return {
    phase: 'silence',
    phaseElapsedMs: 0,
    silenceMs: 0,
    activeMs: 0,
    currentViseme: 'viseme_sil',
    visemeElapsedMs: 0,
  };
}

export function updateSpeechState(
  state: SpeechState,
  features: AudioFeatures,
  deltaMs: number,
  guess?: HeuristicVisemeGuess,
): SpeechState {
  state.phaseElapsedMs += deltaMs;
  state.visemeElapsedMs += deltaMs;

  const speaking = features.envelope >= SPEECH_THRESHOLDS.on;
  const decaying = features.envelope <= SPEECH_THRESHOLDS.off;
  const noisyConsonant = features.spectralFlux > 0.1 && features.voicedConfidence < 0.45;

  if (speaking) {
    state.activeMs += deltaMs;
    state.silenceMs = 0;
  } else {
    state.silenceMs += deltaMs;
    state.activeMs = 0;
  }

  let nextPhase = state.phase;

  switch (state.phase) {
    case 'silence':
      if (speaking) nextPhase = 'onset';
      break;
    case 'onset':
      if (!speaking && state.phaseElapsedMs >= SPEECH_THRESHOLDS.pauseEnterMs) {
        nextPhase = 'pause';
      } else if (state.phaseElapsedMs >= SPEECH_THRESHOLDS.onsetHoldMs) {
        nextPhase = noisyConsonant ? 'consonant' : 'vowel';
      }
      break;
    case 'vowel':
    case 'consonant':
      if (decaying) nextPhase = 'release';
      else if (noisyConsonant) nextPhase = 'consonant';
      else nextPhase = 'vowel';
      break;
    case 'release':
      if (speaking) nextPhase = 'onset';
      else if (state.phaseElapsedMs >= SPEECH_THRESHOLDS.pauseEnterMs) nextPhase = 'pause';
      break;
    case 'pause':
      if (speaking) nextPhase = 'onset';
      else if (state.phaseElapsedMs >= SPEECH_THRESHOLDS.silenceSettleMs) nextPhase = 'silence';
      break;
    default:
      nextPhase = 'silence';
  }

  if (nextPhase !== state.phase) {
    state.phase = nextPhase;
    state.phaseElapsedMs = 0;
  }

  if (guess?.primary && (state.currentViseme !== guess.primary || state.visemeElapsedMs >= SPEECH_THRESHOLDS.minVisemeDwellMs)) {
    state.currentViseme = guess.primary;
    state.visemeElapsedMs = 0;
  }

  return state;
}
