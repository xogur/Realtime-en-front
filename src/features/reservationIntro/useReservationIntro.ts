'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getKioskIdFromLocation } from '@/lib/kioskIdentity';
import { useStore } from '@/stores/useStore';
import { usePresenceDetector } from '@/features/presence/usePresenceDetector';
import {
  deriveStartedAtMs,
  getReservationIntroApiUrl,
  nextFourSecondBoundaryDelay,
  phaseForElapsed,
  readStoredIntro,
  rememberIntroCompleted,
  rememberIntroStarted,
} from './model';
import type {
  ActiveReservationIntro,
  ReservationIntroCompletionReason,
  ReservationIntroEvent,
  ReservationIntroRole,
  ParticipantSkipReason,
} from './types';

const SUPPORTED_KIOSKS = new Set(['A02', 'A03', 'A04']);

export function useReservationIntro(role: ReservationIntroRole) {
  const [active, setActive] = useState<ActiveReservationIntro | null>(null);
  const [reservationSession, setReservationSession] = useState<ReservationIntroEvent | null>(null);
  const [participantWelcomeName, setParticipantWelcomeName] = useState<string | null>(null);
  const [introPresentationPending, setIntroPresentationPending] = useState(false);
  const reservationSessionRef = useRef<ReservationIntroEvent | null>(null);
  const activeRef = useRef<ActiveReservationIntro | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const requestInFlightRef = useRef(false);
  const completingRef = useRef(false);
  const presenceReportEventRef = useRef<string | null>(null);
  const presenceReportInFlightRef = useRef(false);
  const enabled = process.env.NEXT_PUBLIC_COCOON_RESERVATION_INTRO_ENABLED !== 'false';
  const presence = usePresenceDetector(role === 'avatar');

  const updateActive = useCallback((value: ActiveReservationIntro | null) => {
    if (value && activeRef.current?.event.eventId !== value.event.eventId) {
      setIntroPresentationPending(true);
    }
    activeRef.current = value;
    setActive(value);
  }, []);

  const updateReservationSession = useCallback((value: ReservationIntroEvent | null) => {
    reservationSessionRef.current = value;
    setReservationSession(value);
  }, []);

  const markLocalComplete = useCallback((eventId: string) => {
    const startedAtMs = startedAtRef.current ?? Date.now();
    rememberIntroCompleted(eventId, startedAtMs);
    startedAtRef.current = null;
    updateActive(null);
  }, [updateActive]);

  const complete = useCallback(async (reason: ReservationIntroCompletionReason) => {
    const current = activeRef.current;
    if (!current || completingRef.current) return;
    completingRef.current = true;
    const url = `${getReservationIntroApiUrl(current.event.kioskId)}/complete`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: current.event.eventId, reason }),
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`completion failed: ${response.status}`);
      }
      markLocalComplete(current.event.eventId);
    } catch (error) {
      console.warn('[reservation-intro] completion will be retried until fail-open', error);
      if (reason === 'timeout') markLocalComplete(current.event.eventId);
    } finally {
      completingRef.current = false;
    }
  }, [markLocalComplete]);

  useEffect(() => {
    if (!enabled) return;
    const kioskId = getKioskIdFromLocation().toUpperCase();
    if (!SUPPORTED_KIOSKS.has(kioskId)) return;
    let disposed = false;

    const schedule = (delayMs: number) => {
      if (disposed) return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(poll, delayMs);
    };

    const accept = (event: ReservationIntroEvent, receivedAtMs: number) => {
      updateReservationSession(event);
      if (event.status === 'completed') {
        const stored = readStoredIntro(event.eventId);
        rememberIntroCompleted(
          event.eventId,
          stored?.startedAtMs ?? deriveStartedAtMs(event, receivedAtMs),
        );
        startedAtRef.current = null;
        updateActive(null);
        return;
      }

      if (event.status === 'waiting_for_presence') {
        startedAtRef.current = null;
        updateActive(null);
        return;
      }

      const stored = readStoredIntro(event.eventId);
      if (stored?.completedAtMs) {
        updateActive(null);
        if (role === 'guide' && !completingRef.current) {
          void fetch(`${getReservationIntroApiUrl(kioskId)}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: event.eventId, reason: 'ended' }),
          });
        }
        return;
      }

      const startedAtMs = stored?.startedAtMs
        ?? deriveStartedAtMs(event, receivedAtMs);
      if (!stored) rememberIntroStarted(event.eventId, startedAtMs);
      startedAtRef.current = startedAtMs;
      const elapsedMs = Math.max(0, receivedAtMs - startedAtMs);
      if (elapsedMs >= event.maxDurationMs) {
        rememberIntroCompleted(event.eventId, startedAtMs);
        updateActive(null);
        if (role === 'guide') {
          const timeoutEvent: ActiveReservationIntro = {
            event,
            elapsedMs,
            phase: phaseForElapsed(event, elapsedMs),
          };
          activeRef.current = timeoutEvent;
          void complete('timeout');
        }
        return;
      }

      if (activeRef.current?.event.eventId !== event.eventId) {
        useStore.getState().setReservationIntroEventId(event.eventId);
      }
      updateActive({ event, elapsedMs, phase: phaseForElapsed(event, elapsedMs) });
    };

    const poll = async () => {
      if (disposed || requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      try {
        const response = await fetch(getReservationIntroApiUrl(kioskId), {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        const receivedAtMs = Date.now();
        if (response.status === 204) {
          // Cancellation or end-of-reservation is fail-open: restore the normal program.
          startedAtRef.current = null;
          updateActive(null);
          updateReservationSession(null);
        } else if (response.ok) {
          accept(await response.json() as ReservationIntroEvent, receivedAtMs);
        } else if (response.status !== 503) {
          console.warn(`[reservation-intro] poll failed: ${response.status}`);
        }
      } catch (error) {
        console.warn('[reservation-intro] poll failed; keeping the English program available', error);
      } finally {
        requestInFlightRef.current = false;
        const current = activeRef.current;
        const pendingSession = reservationSessionRef.current;
        const participantPending = pendingSession?.participant.status === 'required';
        schedule(
          current?.event.activePollMs
            ?? (participantPending ? pendingSession!.activePollMs : nextFourSecondBoundaryDelay(Date.now())),
        );
      }
    };

    schedule(nextFourSecondBoundaryDelay(Date.now()));
    return () => {
      disposed = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [complete, enabled, role, updateActive, updateReservationSession]);

  useEffect(() => {
    const session = reservationSession;
    if (
      role !== 'avatar'
      || !presence.present
      || !session
      || session.status !== 'waiting_for_presence'
      || presenceReportEventRef.current === session.eventId
      || presenceReportInFlightRef.current
    ) return;

    presenceReportInFlightRef.current = true;
    void fetch(`${getReservationIntroApiUrl(session.kioskId)}/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: session.eventId }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`presence report failed: ${response.status}`);
        const updated = await response.json() as ReservationIntroEvent;
        presenceReportEventRef.current = session.eventId;
        updateReservationSession(updated);
      })
      .catch((error) => {
        console.warn('[reservation-intro] presence report failed', error);
      })
      .finally(() => {
        presenceReportInFlightRef.current = false;
      });
  }, [presence.present, reservationSession, role, updateReservationSession]);

  const activeEventId = active?.event.eventId;
  useEffect(() => {
    if (!activeEventId) return;
    const timer = window.setInterval(() => {
      const current = activeRef.current;
      const startedAtMs = startedAtRef.current;
      if (!current || startedAtMs === null) return;
      const elapsedMs = Math.max(0, Date.now() - startedAtMs);
      if (elapsedMs >= current.event.maxDurationMs) {
        if (role === 'guide') void complete('timeout');
        else markLocalComplete(current.event.eventId);
        return;
      }
      const phase = phaseForElapsed(current.event, elapsedMs);
      if (phase !== current.phase || Math.abs(elapsedMs - current.elapsedMs) >= 200) {
        updateActive({ ...current, elapsedMs, phase });
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [activeEventId, complete, markLocalComplete, role, updateActive]);

  const updateParticipant = useCallback(async (
    body: { action: 'confirm'; name: string } | { action: 'skip'; reason: ParticipantSkipReason },
    beforeApply?: () => void,
  ) => {
    const session = reservationSession;
    if (!session) throw new Error('No reservation session is active');
    const response = await fetch(
      `${getReservationIntroApiUrl(session.kioskId)}/participant-name`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: session.eventId, ...body }),
      },
    );
    if (!response.ok) throw new Error(`participant update failed: ${response.status}`);
    const updated = await response.json() as ReservationIntroEvent;
    beforeApply?.();
    updateReservationSession(updated);
    return updated;
  }, [reservationSession, updateReservationSession]);

  const confirmParticipantName = useCallback(
    (name: string) => updateParticipant(
      { action: 'confirm', name },
      () => setParticipantWelcomeName(name),
    ),
    [updateParticipant],
  );
  const skipParticipantName = useCallback(
    (reason: ParticipantSkipReason) => updateParticipant({ action: 'skip', reason }),
    [updateParticipant],
  );
  const finishParticipantWelcome = useCallback(() => {
    setParticipantWelcomeName(null);
  }, []);
  const finishIntroPresentation = useCallback(() => {
    setIntroPresentationPending(false);
  }, []);
  const needsNameCapture = shouldShowParticipantNameOverlay(
    reservationSession,
    participantWelcomeName,
    introPresentationPending,
  );

  return {
    active,
    complete,
    reservationSession,
    participant: reservationSession?.participant ?? null,
    needsNameCapture,
    participantWelcomeName,
    finishIntroPresentation,
    confirmParticipantName,
    finishParticipantWelcome,
    skipParticipantName,
    presenceStatus: presence.status,
    retryPresence: presence.retry,
  };
}

export function shouldShowParticipantNameOverlay(
  reservationSession: ReservationIntroEvent | null,
  participantWelcomeName: string | null,
  introPresentationPending: boolean,
) {
  if (introPresentationPending) return false;
  return Boolean(
    participantWelcomeName
      || (
        reservationSession?.status === 'completed'
          && reservationSession.participant.captureRequired
          && reservationSession.participant.status === 'required'
      ),
  );
}
