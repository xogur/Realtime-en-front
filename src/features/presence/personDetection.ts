// Prefer false-negative results over starting an unattended booth. A person
// candidate must be independently strong before temporal evidence can count it.
export const PERSON_DETECTION_CONFIDENCE = 0.5;
export const PRESENCE_EVIDENCE_SAMPLE_COUNT = 8;
export const PRESENCE_EVIDENCE_MAX_AGE_MS = 750;
export const PRESENCE_EVIDENCE_MAX_GAP_MS = 500;

const MIN_OBSERVATION_DURATION_MS = 1_500;
const MAX_OBSERVATION_DURATION_MS = 2_500;

const MIN_PERSON_HEIGHT_RATIO = 0.22;
const MIN_PERSON_AREA_RATIO = 0.035;
const MAX_PERSON_AREA_RATIO = 0.85;
const REQUIRED_POSITIVE_SAMPLES = 6;
const REQUIRED_EVIDENCE_SCORE = 12;

type DetectionCategory = {
  categoryName?: string;
  displayName?: string;
  score?: number;
};

type BoundingBox = {
  width: number;
  height: number;
};

type PersonDetection = {
  categories: DetectionCategory[];
  boundingBox?: BoundingBox;
};

export type PersonFrameEvidence = {
  positive: boolean;
  evidenceScore: number;
  confidence: number;
};

type TimedPersonFrameEvidence = PersonFrameEvidence & {
  capturedAtMs: number;
};

export type PresenceEvidenceState = {
  samples: TimedPersonFrameEvidence[];
};

export type PresenceEvidenceSummary = {
  confirmed: boolean;
  sampleCount: number;
  positiveCount: number;
  evidenceScore: number;
  maxConfidence: number;
  durationMs: number;
  lastPositiveAtMs: number | null;
};

function isPerson(category: DetectionCategory) {
  return category.categoryName?.trim().toLowerCase() === 'person'
    || category.displayName?.trim().toLowerCase() === 'person';
}

function confidenceEvidence(score: number) {
  if (score < PERSON_DETECTION_CONFIDENCE) return 0;
  return 2;
}

function hasPersonGeometry(
  boundingBox: BoundingBox | undefined,
  frameWidth: number,
  frameHeight: number,
) {
  if (
    !boundingBox
    || !Number.isFinite(frameWidth)
    || !Number.isFinite(frameHeight)
    || frameWidth <= 0
    || frameHeight <= 0
    || boundingBox.width <= 0
    || boundingBox.height <= 0
  ) return false;

  const heightRatio = boundingBox.height / frameHeight;
  const areaRatio = (boundingBox.width * boundingBox.height) / (frameWidth * frameHeight);
  return heightRatio >= MIN_PERSON_HEIGHT_RATIO
    && areaRatio >= MIN_PERSON_AREA_RATIO
    && areaRatio <= MAX_PERSON_AREA_RATIO;
}

export function evaluatePersonFrame(
  detections: PersonDetection[],
  frameWidth: number,
  frameHeight: number,
): PersonFrameEvidence {
  let bestConfidence = 0;
  let bestEvidenceScore = 0;

  for (const detection of detections) {
    const personConfidence = Math.max(
      0,
      ...detection.categories
        .filter(isPerson)
        .map((category) => category.score ?? 0)
        .filter((score) => Number.isFinite(score) && score >= 0 && score <= 1),
    );
    if (personConfidence < PERSON_DETECTION_CONFIDENCE) continue;
    if (!hasPersonGeometry(detection.boundingBox, frameWidth, frameHeight)) continue;

    const evidenceScore = confidenceEvidence(personConfidence);
    if (evidenceScore > bestEvidenceScore) {
      bestEvidenceScore = evidenceScore;
      bestConfidence = personConfidence;
    }
  }

  return {
    positive: bestEvidenceScore > 0,
    evidenceScore: bestEvidenceScore,
    confidence: bestConfidence,
  };
}

export function createPresenceEvidenceState(): PresenceEvidenceState {
  return { samples: [] };
}

export function addPresenceEvidence(
  state: PresenceEvidenceState,
  frame: PersonFrameEvidence,
  capturedAtMs: number,
): { state: PresenceEvidenceState; summary: PresenceEvidenceSummary } {
  const previousCapturedAtMs = state.samples.at(-1)?.capturedAtMs;
  const hasInvalidGap = previousCapturedAtMs !== undefined
    && (
      capturedAtMs <= previousCapturedAtMs
      || capturedAtMs - previousCapturedAtMs > PRESENCE_EVIDENCE_MAX_GAP_MS
    );
  const recentSamples = (hasInvalidGap ? [] : state.samples)
    .filter((sample) => capturedAtMs - sample.capturedAtMs <= MAX_OBSERVATION_DURATION_MS);
  const samples = [
    ...recentSamples,
    { ...frame, capturedAtMs },
  ].slice(-PRESENCE_EVIDENCE_SAMPLE_COUNT);
  const positiveSamples = samples.filter((sample) => sample.positive);
  const lastPositiveAtMs = positiveSamples.at(-1)?.capturedAtMs ?? null;
  const evidenceScore = positiveSamples.reduce((total, sample) => total + sample.evidenceScore, 0);
  const positiveCount = positiveSamples.length;
  const sampleCount = samples.length;
  const durationMs = sampleCount > 1
    ? samples[sampleCount - 1].capturedAtMs - samples[0].capturedAtMs
    : 0;
  const isFresh = lastPositiveAtMs !== null
    && capturedAtMs - lastPositiveAtMs <= PRESENCE_EVIDENCE_MAX_AGE_MS;

  return {
    state: { samples },
    summary: {
      confirmed: sampleCount === PRESENCE_EVIDENCE_SAMPLE_COUNT
        && positiveCount >= REQUIRED_POSITIVE_SAMPLES
        && evidenceScore >= REQUIRED_EVIDENCE_SCORE
        && durationMs >= MIN_OBSERVATION_DURATION_MS
        && durationMs <= MAX_OBSERVATION_DURATION_MS
        && isFresh,
      sampleCount,
      positiveCount,
      evidenceScore,
      maxConfidence: positiveSamples.reduce(
        (highest, sample) => Math.max(highest, sample.confidence),
        0,
      ),
      durationMs,
      lastPositiveAtMs,
    },
  };
}
