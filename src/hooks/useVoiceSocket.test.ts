import { describe, expect, it } from 'vitest';

import {
  buildAudioPacket,
  buildClientTurnId,
  getSupplementaryPollDelayMs,
  isEvaluationBatchIdle,
  shouldProcessEventSeq,
} from './useVoiceSocket';

describe('buildAudioPacket', () => {
  it('includes the browser sample rate and normalized peak for STT diagnostics', () => {
    const pcm = new Int16Array([0, -16_384, 8_192]);
    const packet = buildAudioPacket(pcm, true, 48_000, 0x1_0000_0005);
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);

    expect(view.getUint32(0, false)).toBe(5);
    expect(view.getUint32(4, false)).toBe(1);
    expect(view.getUint32(8, false)).toBe(48_000);
    expect(view.getUint32(12, false)).toBe(500_000);
    expect(Array.from(packet.slice(16))).toEqual(Array.from(new Uint8Array(pcm.buffer)));
  });

  it('caps the normalized peak metadata at one million ppm', () => {
    const packet = buildAudioPacket(new Int16Array([-32_768]), false);
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);

    expect(view.getUint32(4, false)).toBe(0);
    expect(view.getUint32(12, false)).toBe(1_000_000);
  });
});

describe('shouldProcessEventSeq', () => {
  it('skips duplicate replayable events with the same event sequence', () => {
    const seen = new Set<string>();
    const order: string[] = [];

    expect(shouldProcessEventSeq({ type: 'final_assistant_answer', eventSeq: 42 }, seen, order)).toBe(true);
    expect(shouldProcessEventSeq({ type: 'final_assistant_answer', eventSeq: 42 }, seen, order)).toBe(false);
  });

  it('does not dedupe replay control events that can share the current sequence', () => {
    const seen = new Set<string>();
    const order: string[] = [];

    expect(shouldProcessEventSeq({ type: 'session_replay_start', eventSeq: 7 }, seen, order)).toBe(true);
    expect(shouldProcessEventSeq({ type: 'session_replay_end', eventSeq: 7 }, seen, order)).toBe(true);
  });

  it('allows different event types to share a backend event sequence', () => {
    const seen = new Set<string>();
    const order: string[] = [];

    expect(shouldProcessEventSeq({ type: 'turn_evaluation', eventSeq: 9 }, seen, order)).toBe(true);
    expect(shouldProcessEventSeq({ type: 'evaluation_batch_status', eventSeq: 9 }, seen, order)).toBe(true);
  });
});

describe('buildClientTurnId', () => {
  it('uses the stable server turn id without adding the event sequence', () => {
    expect(buildClientTurnId('6', 1402, '7:6')).toBe('7:6');
  });

  it('keeps replayed generations from overwriting later turns with the same backend id', () => {
    expect(buildClientTurnId('1', 1225)).toBe('1:event-1225');
    expect(buildClientTurnId('1', 1348)).toBe('1:event-1348');
  });

  it('falls back to the backend id when no event sequence exists', () => {
    expect(buildClientTurnId('2')).toBe('2');
    expect(buildClientTurnId(null, 10)).toBeUndefined();
  });
});

describe('supplementary polling backoff', () => {
  it('backs off from two seconds and stays capped for long-running batch evaluation', () => {
    expect(getSupplementaryPollDelayMs(0)).toBe(2_000);
    expect(getSupplementaryPollDelayMs(1)).toBe(3_000);
    expect(getSupplementaryPollDelayMs(20)).toBe(12_000);
  });

  it('treats a missing or zero-count full REST batch status as idle, but not a live batch', () => {
    expect(isEvaluationBatchIdle(null)).toBe(true);
    expect(isEvaluationBatchIdle({ pendingCount: 0 })).toBe(true);
    expect(isEvaluationBatchIdle({ pendingCount: 2 })).toBe(false);
  });
});
