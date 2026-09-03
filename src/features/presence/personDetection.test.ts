import { describe, expect, it } from 'vitest';
import {
  addPresenceEvidence,
  createPresenceEvidenceState,
  evaluatePersonFrame,
  PERSON_DETECTION_CONFIDENCE,
  type PersonFrameEvidence,
  type PresenceEvidenceState,
} from './personDetection';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 360;

function personFrame(score: number, width = 180, height = 250) {
  return evaluatePersonFrame([
    {
      categories: [{ categoryName: 'person', score }],
      boundingBox: { width, height },
    },
  ], FRAME_WIDTH, FRAME_HEIGHT);
}

function addFrames(frames: PersonFrameEvidence[]) {
  let state: PresenceEvidenceState = createPresenceEvidenceState();
  let result = addPresenceEvidence(state, frames[0], 0);
  state = result.state;
  frames.slice(1).forEach((frame, index) => {
    result = addPresenceEvidence(state, frame, (index + 1) * 250);
    state = result.state;
  });
  return result.summary;
}

describe('person detection policy', () => {
  it('requires a high-confidence person candidate', () => {
    expect(PERSON_DETECTION_CONFIDENCE).toBe(0.5);
    expect(personFrame(0.4999)).toEqual({
      positive: false,
      evidenceScore: 0,
      confidence: 0,
    });
    expect(personFrame(0.5)).toEqual({
      positive: true,
      evidenceScore: 2,
      confidence: 0.5,
    });
  });

  it('rejects a person label without a plausible booth-sized bounding box', () => {
    expect(personFrame(0.8, 20, 30).positive).toBe(false);
    expect(personFrame(0.8, 630, 355).positive).toBe(false);
  });

  it('does not confirm a transient low-confidence false positive', () => {
    const absent = evaluatePersonFrame([], FRAME_WIDTH, FRAME_HEIGHT);
    const summary = addFrames([
      personFrame(0.06), personFrame(0.06), absent, absent,
      absent, absent, absent, absent,
    ]);
    expect(summary.confirmed).toBe(false);
    expect(summary.positiveCount).toBe(0);
  });

  it('does not confirm a sustained low-confidence person misclassification', () => {
    const summary = addFrames(Array.from({ length: 8 }, () => personFrame(0.49)));
    expect(summary.confirmed).toBe(false);
    expect(summary.positiveCount).toBe(0);
    expect(summary.evidenceScore).toBe(0);
  });

  it('confirms a sustained high-confidence person across the full observation window', () => {
    const summary = addFrames(Array.from({ length: 8 }, () => personFrame(0.7)));
    expect(summary.confirmed).toBe(true);
    expect(summary.positiveCount).toBe(8);
    expect(summary.durationMs).toBe(1_750);
  });

  it('requires at least six high-confidence samples in the observation window', () => {
    const absent = evaluatePersonFrame([], FRAME_WIDTH, FRAME_HEIGHT);
    const fivePositive = addFrames([
      personFrame(0.8), personFrame(0.8), personFrame(0.8), personFrame(0.8),
      personFrame(0.8), absent, absent, absent,
    ]);
    const sixPositive = addFrames([
      personFrame(0.8), personFrame(0.8), personFrame(0.8), personFrame(0.8),
      personFrame(0.8), personFrame(0.8), absent, absent,
    ]);

    expect(fivePositive.confirmed).toBe(false);
    expect(sixPositive.confirmed).toBe(true);
  });

  it('applies the 750ms freshness boundary independently of count and score', () => {
    const absent = evaluatePersonFrame([], FRAME_WIDTH, FRAME_HEIGHT);
    const frames = [
      personFrame(0.8), personFrame(0.8), personFrame(0.8), personFrame(0.8),
      personFrame(0.8), personFrame(0.8), absent, absent,
    ];
    const evaluateAt = (lastPositiveTimestamp: number) => {
      let state: PresenceEvidenceState = createPresenceEvidenceState();
      let summary;
      frames.forEach((frame, index) => {
        const timestamps = [0, 250, 500, 750, 1_000, lastPositiveTimestamp, 1_500, 2_000];
        const capturedAtMs = timestamps[index];
        const result = addPresenceEvidence(state, frame, capturedAtMs);
        state = result.state;
        summary = result.summary;
      });
      return summary;
    };

    expect(evaluateAt(1_250)?.confirmed).toBe(true);
    expect(evaluateAt(1_249)?.positiveCount).toBe(6);
    expect(evaluateAt(1_249)?.evidenceScore).toBe(12);
    expect(evaluateAt(1_249)?.confirmed).toBe(false);
  });

  it('resets old evidence after a long frame gap', () => {
    let state: PresenceEvidenceState = createPresenceEvidenceState();
    Array.from({ length: 7 }, (_, index) => index * 250).forEach((capturedAtMs) => {
      const result = addPresenceEvidence(state, personFrame(0.8), capturedAtMs);
      state = result.state;
    });
    const afterGap = addPresenceEvidence(state, personFrame(0.8), 60_000);
    expect(afterGap.summary.sampleCount).toBe(1);
    expect(afterGap.summary.confirmed).toBe(false);
  });

  it('requires an observation duration instead of accepting a burst of frames', () => {
    let state: PresenceEvidenceState = createPresenceEvidenceState();
    let summary;
    Array.from({ length: 8 }, (_, index) => index * 100).forEach((capturedAtMs) => {
      const result = addPresenceEvidence(state, personFrame(0.8), capturedAtMs);
      state = result.state;
      summary = result.summary;
    });
    expect(summary?.durationMs).toBe(700);
    expect(summary?.confirmed).toBe(false);
  });

  it('does not promote an invalid confidence value to strong evidence', () => {
    expect(personFrame(Number.NaN).positive).toBe(false);
    expect(personFrame(-0.1).positive).toBe(false);
    expect(personFrame(1.1).positive).toBe(false);
  });

  it('ignores non-person categories', () => {
    expect(evaluatePersonFrame([
      {
        categories: [{ categoryName: 'cell phone', score: 0.99 }],
        boundingBox: { width: 180, height: 250 },
      },
    ], FRAME_WIDTH, FRAME_HEIGHT).positive).toBe(false);
  });
});
