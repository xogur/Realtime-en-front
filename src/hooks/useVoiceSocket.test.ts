import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addFinalUserRequestMessage,
  buildAudioPacket,
  buildClientTurnId,
  fetchWithTimeout,
  getTurnResultsUrl,
  getSupplementaryPollDelayMs,
  isEvaluationBatchIdle,
  isCurrentSupplementaryPoll,
  shouldIgnorePartialAssistantAnswer,
  shouldProcessEventSeq,
} from './useVoiceSocket';

describe('final user request messages', () => {
  it('propagates browser speech evidence into the stored user message', () => {
    const addMessage = vi.fn();
    const speechEvidence = {
      version: 1 as const,
      provider: 'browser' as const,
      finalSegments: ['I like morning walks', 'They make me feel fresh'],
    };

    addFinalUserRequestMessage(
      addMessage,
      '<|start_of_turn|>user I like morning walks They make me feel fresh',
      'turn-1',
      speechEvidence,
    );

    expect(addMessage).toHaveBeenCalledWith(
      'user',
      'I like morning walks They make me feel fresh',
      'turn-1',
      speechEvidence,
    );
  });

  it('preserves natural role words while keeping sanitized evidence aligned', () => {
    const addMessage = vi.fn();
    const speechEvidence = {
      version: 1 as const,
      provider: 'browser' as const,
      finalSegments: ['I am a user', 'I like this app'],
    };

    addFinalUserRequestMessage(
      addMessage,
      'I am a user I like this app',
      'turn-role-word',
      speechEvidence,
    );

    expect(addMessage).toHaveBeenCalledWith(
      'user',
      'I am a user I like this app',
      'turn-role-word',
      speechEvidence,
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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

  it('requires an explicit idle phase with no queued or in-flight evaluations', () => {
    expect(isEvaluationBatchIdle(null)).toBe(false);
    expect(isEvaluationBatchIdle({ pendingCount: 0 })).toBe(false);
    expect(isEvaluationBatchIdle({ pendingCount: 0, inFlightCount: 1, phase: 'evaluating' })).toBe(false);
    expect(isEvaluationBatchIdle({ pendingCount: 2, inFlightCount: 0, phase: 'queued' })).toBe(false);
    expect(isEvaluationBatchIdle({ pendingCount: 0, inFlightCount: 0, phase: 'idle' })).toBe(true);
  });

  it('queries supplementary results by the stable client turn id as well as legacy generation id', () => {
    const url = new URL(getTurnResultsUrl('1', '9:1'));

    expect(url.searchParams.get('generationId')).toBe('1');
    expect(url.searchParams.get('turnId')).toBe('9:1');
  });

  it('aborts a supplementary HTTP request that never resolves', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => new Promise((_, reject) => {
      requestSignal = init?.signal ?? null;
      requestSignal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    }));

    const request = fetchWithTimeout('/api/kiosks/TEST/turn-results', {}, 50);
    const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    expect(requestSignal).not.toBeNull();
    expect((requestSignal as AbortSignal).aborted).toBe(true);
  });

  it('rejects an old poll identity after a reconnect starts a replacement poll', () => {
    const oldPoll = { attempt: 0 };
    const replacementPoll = { attempt: 0 };
    const polls = new Map([['turn-1', oldPoll]]);

    expect(isCurrentSupplementaryPoll(polls, 'turn-1', oldPoll)).toBe(true);
    polls.set('turn-1', replacementPoll);
    expect(isCurrentSupplementaryPoll(polls, 'turn-1', oldPoll)).toBe(false);
    expect(isCurrentSupplementaryPoll(polls, 'turn-1', replacementPoll)).toBe(true);
  });

  it('ignores late partial assistant text after the same generation was finalized', () => {
    const finalized = new Set(['generation-7']);

    expect(shouldIgnorePartialAssistantAnswer('generation-7', finalized)).toBe(true);
    expect(shouldIgnorePartialAssistantAnswer('generation-8', finalized)).toBe(false);
    expect(shouldIgnorePartialAssistantAnswer(null, finalized)).toBe(false);
  });
});
