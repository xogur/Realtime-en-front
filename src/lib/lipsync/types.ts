export type Emotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'annoyed';

export type LipSyncMode = 'heuristic' | 'timeline' | 'hybrid';

export type VisemeId =
  | 'viseme_sil'
  | 'viseme_PP'
  | 'viseme_FF'
  | 'viseme_TH'
  | 'viseme_DD'
  | 'viseme_kk'
  | 'viseme_CH'
  | 'viseme_SS'
  | 'viseme_nn'
  | 'viseme_RR'
  | 'viseme_aa'
  | 'viseme_E'
  | 'viseme_I'
  | 'viseme_O'
  | 'viseme_U';

export type SpeechPhase =
  | 'silence'
  | 'onset'
  | 'vowel'
  | 'consonant'
  | 'release'
  | 'pause';

export interface AudioFeatures {
  sampleRate: number;
  rms: number;
  envelope: number;
  envelopeDelta: number;
  spectralFlux: number;
  zcr: number;
  bands: number[];
  bandRatios: number[];
  centroidHz: number;
  voicedConfidence: number;
}

export interface FeatureExtractorState {
  previousEnvelope: number;
  previousBandRatios: number[];
}

export interface SpeechState {
  phase: SpeechPhase;
  phaseElapsedMs: number;
  silenceMs: number;
  activeMs: number;
  currentViseme: VisemeId;
  visemeElapsedMs: number;
}

export interface HeuristicVisemeGuess {
  phase: SpeechPhase;
  primary: VisemeId;
  primaryWeight: number;
  secondary?: VisemeId;
  secondaryWeight?: number;
  openness: number;
  roundness: number;
  spread: number;
  lipPress: number;
  confidence: number;
}

export interface TtsVisemeEvent {
  startMs: number;
  endMs: number;
  primary: VisemeId;
  primaryWeight: number;
  secondary?: VisemeId;
  secondaryWeight?: number;
  phase?: SpeechPhase;
  openness?: number;
  roundness?: number;
  spread?: number;
  lipPress?: number;
}

export interface TtsVisemeTimeline {
  version: 'v1';
  responseId: string;
  segmentId: string;
  sampleRate: number;
  durationMs: number;
  language: 'ko' | 'en' | 'mixed';
  events: TtsVisemeEvent[];
}

export interface ScheduledTtsSegment {
  responseId: string;
  segmentId: string;
  sampleRate: number;
  text?: string;
  emotion?: Emotion;
  audioStartContextTime?: number;
  audioEndContextTime?: number;
  timeline?: TtsVisemeTimeline;
}

export interface TtsAudioChunk {
  content: string;
  generationId?: string;
  responseId?: string;
  segmentId?: string;
  sampleRate?: number;
  seq?: number;
}

export interface AvatarLipProfile {
  avatarId: string;
  jawOpenMax: number;
  jawOpenBias: number;
  mouthOpenBias: number;
  roundnessMax: number;
  spreadMax: number;
  lipPressMax: number;
  onsetOpenSpeed: number;
  closeSpeed: number;
  silenceCloseSpeed: number;
  smileMouthBlend: number;
  fishLipClamp: number;
}

export interface ResolvedVisemeFrame {
  phase: SpeechPhase;
  visemeWeights: Partial<Record<VisemeId, number>>;
  jawOpen: number;
  mouthPucker: number;
  mouthFunnel: number;
  mouthStretchLeft: number;
  mouthStretchRight: number;
  mouthPressLeft: number;
  mouthPressRight: number;
  mouthDimpleLeft: number;
  mouthDimpleRight: number;
  confidence: number;
  source: LipSyncMode;
}

export interface TimelineResolution {
  event: TtsVisemeEvent | null;
  lookaheadEvent: TtsVisemeEvent | null;
  segment: ScheduledTtsSegment | null;
  mode: LipSyncMode;
  currentTimeMs: number;
}

export interface LipSyncDebugSnapshot {
  mode: LipSyncMode;
  segmentId: string | null;
  phase: SpeechPhase;
  primaryViseme: VisemeId;
  secondaryViseme: VisemeId | null;
  confidence: number;
  envelope: number;
  spectralFlux: number;
  voicedConfidence: number;
  openness: number;
  roundness: number;
  spread: number;
  lipPress: number;
  profileId: string;
}
