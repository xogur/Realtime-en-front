import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addFinalUserRequestMessage,
  buildAudioPacket,
  buildSttCaptureStateMessage,
  buildClientTurnId,
  fetchWithTimeout,
  getTurnResultsUrl,
  getSupplementaryPollDelayMs,
  isEvaluationBatchIdle,
  isCurrentSupplementaryPoll,
  normalizeReplySuggestions,
  shouldIgnorePartialAssistantAnswer,
  shouldProcessEventSeq,
  isSttInputReady,
  isCurrentSttCaptureRequest,
  startSttCaptureOperation,
  stopSttCaptureOperation,
  isMessageForCurrentGeneration,
  isTtsControlForCurrentGeneration,
  shouldApplyTtsMute,
  canPlayConversationTts,
  transitionTranslatorTtsGate,
} from './useVoiceSocket';

describe('reply suggestion normalization', () => {
  it('unwraps the malformed singleton arrays seen in production logs', () => {
    const input = {
      suggestions: [
        '["No, thank you for everything."]',
        '["Just the food is fine now."]',
        '["That is all I need."]',
      ],
    } as Parameters<typeof normalizeReplySuggestions>[0];

    expect(normalizeReplySuggestions(input)).toEqual([
      'No, thank you for everything.',
      'Just the food is fine now.',
      'That is all I need.',
    ]);
  });

  it('keeps natural bracketed text and discards structural non-strings', () => {
    const input = {
      suggestions: ['I ordered [two] drinks.', ['Tea, please.'], { text: 'ignore' }],
    } as unknown as Parameters<typeof normalizeReplySuggestions>[0];

    expect(normalizeReplySuggestions(input)).toEqual([
      'I ordered [two] drinks.',
      'Tea, please.',
    ]);
  });
});

describe('STT readiness', () => {
  it('requires both microphone capture and backend readiness for server STT', () => {
    expect(isSttInputReady('server', false, true)).toBe(false);
    expect(isSttInputReady('server', true, false)).toBe(false);
    expect(isSttInputReady('server', true, true)).toBe(true);
  });

  it('uses capture readiness directly for browser STT', () => {
    expect(isSttInputReady('browser', false, false)).toBe(false);
    expect(isSttInputReady('browser', true, false)).toBe(true);
  });
});

describe('STT capture request ordering', () => {
  it('builds the exact backend capture-state contract', () => {
    expect(buildSttCaptureStateMessage(false, 7)).toEqual({
      type: 'stt_capture_state',
      active: false,
      capture_session_id: 7,
    });
  });

  it('lets only the latest start request close its own socket session', () => {
    const oldSocket = {};
    const currentSocket = {};

    expect(isCurrentSttCaptureRequest(2, 2, currentSocket, currentSocket)).toBe(true);
    expect(isCurrentSttCaptureRequest(1, 2, currentSocket, currentSocket)).toBe(false);
    expect(isCurrentSttCaptureRequest(2, 2, oldSocket, currentSocket)).toBe(false);
  });

  it('sends ON before starting input and rolls a current failure back once', async () => {
    const events: string[] = [];
    let sessionId = 0;
    const socket = {};
    const sendCaptureState = (active: boolean) => {
      sessionId += 1;
      events.push(`send:${active}`);
      return sessionId;
    };

    const result = await startSttCaptureOperation({
      sendCaptureState,
      startInput: async () => {
        events.push('start-input');
        return false;
      },
      getCurrentSessionId: () => sessionId,
      getCurrentSocket: () => socket,
    });

    expect(result).toBe('failed');
    expect(events).toEqual(['send:true', 'start-input', 'send:false']);
  });

  it('treats a legacy void start result as success', async () => {
    let sessionId = 0;
    const socket = {};
    await expect(startSttCaptureOperation({
      sendCaptureState: () => {
        sessionId += 1;
        return sessionId;
      },
      startInput: async () => undefined,
      getCurrentSessionId: () => sessionId,
      getCurrentSocket: () => socket,
    })).resolves.toBe('started');
  });

  it('ignores a stale failed start after a newer session or socket takes over', async () => {
    let resolveStart!: (started: boolean) => void;
    const pendingStart = new Promise<boolean>((resolve) => {
      resolveStart = resolve;
    });
    const sends: boolean[] = [];
    let sessionId = 0;
    let socket = {};
    const operation = startSttCaptureOperation({
      sendCaptureState: (active) => {
        sessionId += 1;
        sends.push(active);
        return sessionId;
      },
      startInput: () => pendingStart,
      getCurrentSessionId: () => sessionId,
      getCurrentSocket: () => socket,
    });

    sessionId += 1;
    socket = {};
    resolveStart(false);

    await expect(operation).resolves.toBe('superseded');
    expect(sends).toEqual([true]);
  });

  it('sends OFF before stopping local input', async () => {
    const events: string[] = [];
    await stopSttCaptureOperation(
      (active) => {
        events.push(`send:${active}`);
        return 1;
      },
      async () => {
        events.push('stop-input');
      },
    );

    expect(events).toEqual(['send:false', 'stop-input']);
  });
});

describe('generation-scoped TTS controls', () => {
  it('accepts the active generation and rejects stale controls', () => {
    expect(isMessageForCurrentGeneration(7, '7')).toBe(true);
    expect(isMessageForCurrentGeneration(6, '7')).toBe(false);
  });

  it('keeps legacy unscoped controls compatible', () => {
    expect(isMessageForCurrentGeneration(undefined, '7')).toBe(true);
    expect(isMessageForCurrentGeneration(7, null)).toBe(true);
  });

  it('rejects scoped controls before playback and after playback is cleared', () => {
    expect(isTtsControlForCurrentGeneration(7, null)).toBe(false);
    expect(isTtsControlForCurrentGeneration(7, '7')).toBe(true);
    expect(isTtsControlForCurrentGeneration(6, '7')).toBe(false);
    expect(isTtsControlForCurrentGeneration(7, null)).toBe(false);
    expect(isTtsControlForCurrentGeneration(undefined, '7')).toBe(true);
  });

  it('rejects a late mute after interruption or natural playback idle', () => {
    expect(shouldApplyTtsMute(7, '7', true)).toBe(true);
    expect(shouldApplyTtsMute(7, null, false)).toBe(false);
    expect(shouldApplyTtsMute(7, '7', false)).toBe(false);
  });
});

describe('translator TTS playback gate', () => {
  it('blocks playback immediately when the translator opens', () => {
    const gate = transitionTranslatorTtsGate('normal', 'open-translator');

    expect(gate).toBe('translator-open');
    expect(canPlayConversationTts(gate)).toBe(false);
  });

  it('keeps old response chunks blocked after close until the next user turn', () => {
    const openGate = transitionTranslatorTtsGate('normal', 'open-translator');
    const closedGate = transitionTranslatorTtsGate(openGate, 'close-translator');

    expect(closedGate).toBe('waiting-next-turn');
    expect(canPlayConversationTts(closedGate)).toBe(false);
  });

  it('unlocks after the conversation capture boundary has been reset', () => {
    const nextTurnGate = transitionTranslatorTtsGate(
      'waiting-next-turn',
      'capture-boundary-ready',
    );

    expect(nextTurnGate).toBe('normal');
    expect(canPlayConversationTts(nextTurnGate)).toBe(true);
  });

  it('does not unlock when a delayed final request arrives while the translator is open', () => {
    expect(transitionTranslatorTtsGate(
      'translator-open',
      'final-user-request',
    ))
      .toBe('translator-open');
  });

  it('keeps every final muted until the capture reset barrier completes', () => {
    expect(transitionTranslatorTtsGate(
      'waiting-next-turn',
      'final-user-request',
    )).toBe('waiting-next-turn');
    expect(transitionTranslatorTtsGate(
      'waiting-next-turn',
      'final-user-request',
    )).toBe('waiting-next-turn');
  });

  it('reopens server-STT playback without a browser transcript confirmation', () => {
    let gate = transitionTranslatorTtsGate('normal', 'open-translator');
    gate = transitionTranslatorTtsGate(gate, 'close-translator');
    gate = transitionTranslatorTtsGate(gate, 'final-user-request');
    expect(canPlayConversationTts(gate)).toBe(false);

    gate = transitionTranslatorTtsGate(gate, 'capture-boundary-ready');
    expect(canPlayConversationTts(gate)).toBe(true);
  });

  it('also reopens for an explicit typed conversation input', () => {
    let gate = transitionTranslatorTtsGate('normal', 'open-translator');
    gate = transitionTranslatorTtsGate(gate, 'close-translator');
    gate = transitionTranslatorTtsGate(gate, 'conversation-input-ready');

    expect(canPlayConversationTts(gate)).toBe(true);
  });

  it('handles repeated open and close events without reopening playback', () => {
    expect(transitionTranslatorTtsGate('translator-open', 'open-translator'))
      .toBe('translator-open');
    expect(transitionTranslatorTtsGate('waiting-next-turn', 'close-translator'))
      .toBe('waiting-next-turn');
  });
});

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
