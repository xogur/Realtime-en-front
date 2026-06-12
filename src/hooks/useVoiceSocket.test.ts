import { describe, expect, it } from 'vitest';

import { buildClientTurnId, shouldProcessEventSeq } from './useVoiceSocket';

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
  it('keeps replayed generations from overwriting later turns with the same backend id', () => {
    expect(buildClientTurnId('1', 1225)).toBe('1:event-1225');
    expect(buildClientTurnId('1', 1348)).toBe('1:event-1348');
  });

  it('falls back to the backend id when no event sequence exists', () => {
    expect(buildClientTurnId('2')).toBe('2');
    expect(buildClientTurnId(null, 10)).toBeUndefined();
  });
});
