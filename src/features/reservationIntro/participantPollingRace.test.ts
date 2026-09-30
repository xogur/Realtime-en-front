// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useReservationIntro } from './useReservationIntro';

vi.mock('@/features/presence/usePresenceDetector', () => ({
  usePresenceDetector: () => ({ status: 'idle', present: false, getEvidence: () => ({}), retry: vi.fn() }),
}));
vi.mock('@/lib/kioskIdentity', () => ({ getKioskIdFromLocation: () => 'A04' }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('keeps capture mounted when a confirmed poll arrives before the confirmation response', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-14T02:00:00Z'));
  const required = {
    eventId: 'cocoon:poll-first:intro', kioskId: 'A04', status: 'completed',
    startedAt: '2026-09-14T01:59:00Z', serverNow: '2026-09-14T02:00:00Z',
    activePollMs: 250, participant: { captureRequired: true, status: 'required', source: null },
  };
  const confirmed = { ...required, participant: { captureRequired: true, status: 'confirmed', source: 'captured' } };
  let resolveConfirmation!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => required })
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveConfirmation = resolve; }))
    .mockResolvedValue({ ok: true, status: 200, json: async () => confirmed }));
  const { result } = renderHook(() => useReservationIntro('avatar'));
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  let submission!: Promise<unknown>;
  act(() => { submission = result.current.confirmParticipantName('테스트'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(result.current.participant?.status).toBe('confirmed');
  // Closing here disables the capture hook and resets its startedEventRef.
  expect(result.current.needsNameCapture).toBe(true);
  expect(result.current.programReady).toBe(false);
  await act(async () => {
    resolveConfirmation({ ok: true, status: 200, json: async () => confirmed } as Response);
    await submission;
  });
  expect(result.current.needsNameCapture).toBe(true);
  expect(result.current.participantWelcomeName).toBe('테스트');
  act(() => result.current.finishParticipantWelcome());
  expect(result.current.needsNameCapture).toBe(false);
  expect(result.current.programReady).toBe(true);
});

it.each(['confirmed', 'skipped'] as const)('keeps %s after a late poll and still requests a name for a new reservation', async (status) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-14T02:00:00Z'));
  const required = {
    eventId: 'cocoon:race:intro', kioskId: 'A04', status: 'completed',
    startedAt: '2026-09-14T01:59:00Z', serverNow: '2026-09-14T02:00:00Z',
    activePollMs: 250, participant: { captureRequired: true, status: 'required', source: null },
  };
  const confirmed = { ...required, participant: { captureRequired: true, status, source: status === 'confirmed' ? 'captured' : null } };
  let resolvePoll!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => required })
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolvePoll = resolve; }))
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => confirmed })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => required })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...required, eventId: 'cocoon:next:intro' }) }));
  const { result } = renderHook(() => useReservationIntro('avatar'));
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(result.current.needsNameCapture).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  await act(async () => {
    if (status === 'confirmed') await result.current.confirmParticipantName('테스트');
    else await result.current.skipParticipantName('user_skipped');
  });
  act(() => result.current.finishParticipantWelcome());
  expect(result.current.needsNameCapture).toBe(false);
  await act(async () => {
    resolvePoll({ ok: true, status: 200, json: async () => required } as Response);
  });
  expect(result.current.participant?.status).toBe(status);
  expect(result.current.needsNameCapture).toBe(false);
  // Even a later request returning stale state cannot downgrade this event.
  await act(async () => { await vi.advanceTimersByTimeAsync(3750); });
  expect(result.current.participant?.status).toBe(status);
  expect(result.current.needsNameCapture).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(result.current.reservationSession?.eventId).toBe('cocoon:next:intro');
  expect(result.current.participantName).toBeNull();
  expect(result.current.needsNameCapture).toBe(true);
});

it.each(['failed', 'changed'] as const)('releases the pending confirmation when saving is %s', async (scenario) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-14T02:00:00Z'));
  const required = {
    eventId: 'cocoon:pending:intro', kioskId: 'A04', status: 'completed',
    startedAt: '2026-09-14T01:59:00Z', serverNow: '2026-09-14T02:00:00Z',
    activePollMs: 250, participant: { captureRequired: true, status: 'required', source: null },
  };
  const confirmed = { ...required, participant: { captureRequired: true, status: 'confirmed', source: 'captured' } };
  let resolveConfirmation!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => required })
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveConfirmation = resolve; }))
    .mockResolvedValue({ ok: true, status: 200, json: async () => scenario === 'changed'
      ? { ...confirmed, eventId: 'cocoon:another:intro' } : required }));
  const { result } = renderHook(() => useReservationIntro('avatar'));
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  let submission!: Promise<unknown>;
  act(() => { submission = result.current.confirmParticipantName('테스트').catch((error) => error); });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  if (scenario === 'changed') expect(result.current.needsNameCapture).toBe(false);
  await act(async () => {
    resolveConfirmation({ ok: scenario === 'changed', status: scenario === 'changed' ? 200 : 500,
      json: async () => confirmed } as Response);
    expect(await submission).toBeInstanceOf(Error);
  });
  expect(result.current.participantWelcomeName).toBeNull();
  expect(result.current.participantName).toBeNull();
  expect(result.current.needsNameCapture).toBe(scenario === 'failed');
});
