import type {
  AudioFeatures,
  AvatarLipProfile,
  HeuristicVisemeGuess,
  LipSyncDebugSnapshot,
  ResolvedVisemeFrame,
  ScheduledTtsSegment,
} from './types';

export function createLipSyncDebugSnapshot(params: {
  frame: ResolvedVisemeFrame;
  features: AudioFeatures;
  heuristic: HeuristicVisemeGuess;
  profile: AvatarLipProfile;
  segment: ScheduledTtsSegment | null;
}): LipSyncDebugSnapshot {
  const sortedVisemes = Object.entries(params.frame.visemeWeights)
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
    .map(([viseme]) => viseme);

  return {
    mode: params.frame.source,
    segmentId: params.segment?.segmentId ?? null,
    phase: params.frame.phase,
    primaryViseme: (sortedVisemes[0] as LipSyncDebugSnapshot['primaryViseme']) ?? params.heuristic.primary,
    secondaryViseme: (sortedVisemes[1] as LipSyncDebugSnapshot['secondaryViseme']) ?? params.heuristic.secondary ?? null,
    confidence: params.frame.confidence,
    envelope: params.features.envelope,
    spectralFlux: params.features.spectralFlux,
    voicedConfidence: params.features.voicedConfidence,
    openness: params.heuristic.openness,
    roundness: params.heuristic.roundness,
    spread: params.heuristic.spread,
    lipPress: params.heuristic.lipPress,
    profileId: params.profile.avatarId,
  };
}
