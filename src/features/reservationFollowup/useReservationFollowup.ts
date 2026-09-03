'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getKioskIdFromLocation } from '@/lib/kioskIdentity';
import { endDeadlineMs, getReservationSessionApiUrl, reconcilePolledSession, type ForcedEnd } from './model';
import type { UsageSession } from './types';
import { createFollowupReservation } from './reservationFollowupApi';
import type { DurationMinutes } from './types';

const SUPPORTED_KIOSKS = new Set(['A02', 'A03', 'A04', 'A05']);

export function useReservationFollowup() {
  const [session, setSession] = useState<UsageSession | null>(null);
  const [endPending, setEndPending] = useState(false);
  const [resumePending, setResumePending] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeSignal, setResumeSignal] = useState(0);
  const sessionRef = useRef<UsageSession | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const endingRef = useRef(false);
  const resumingRef = useRef(false);
  const resumeRequestedRef = useRef<number | null>(null);
  const forcedEndRef = useRef<ForcedEnd | null>(null);
  const dismissedReservationRef = useRef<number | null>(null);
  const enabled = process.env.NEXT_PUBLIC_COCOON_RESERVATION_FOLLOWUP_ENABLED !== 'false';

  const updateSession = useCallback((value: UsageSession | null) => {
    sessionRef.current = value;
    setSession(value);
  }, []);

  const endUsage = useCallback(async (reason: 'NATURAL' | 'MANUAL') => {
    const current = sessionRef.current;
    if (!current || current.status !== 'active' || endingRef.current) return;
    endingRef.current = true;
    setEndPending(true);
    // Fail closed immediately. The POST can safely be retried by either display.
    const localEnded: UsageSession = {
      ...current,
      status: 'ended',
      endedAt: new Date().toISOString(),
      endReason: reason,
      canResume: false,
    };
    forcedEndRef.current = { reservationId: current.reservationId, reason, session: localEnded };
    updateSession(localEnded);
    try {
      const response = await fetch(`${getReservationSessionApiUrl(current.kioskId)}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: current.reservationId, reason }),
      });
      if (response.ok) updateSession(await response.json() as UsageSession);
      else if (response.status !== 409) throw new Error(`end failed: ${response.status}`);
    } catch (error) {
      console.warn('[reservation-followup] end persistence failed; program remains locked', error);
    } finally {
      endingRef.current = false;
      setEndPending(false);
    }
  }, [updateSession]);

  const armNaturalEnd = useCallback((value: UsageSession) => {
    if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    if (value.status !== 'active') return;
    const deadline = endDeadlineMs(value.serverNow, value.endAt, Date.now());
    endTimerRef.current = window.setTimeout(
      () => void endUsage('NATURAL'),
      Math.max(0, deadline - Date.now()),
    );
  }, [endUsage]);

  const resumeUsage = useCallback(async (): Promise<UsageSession> => {
    const current = sessionRef.current;
    if (!current || current.status !== 'ended' || !current.canResume) {
      throw new Error('지금은 이전 대화를 다시 이용할 수 없습니다.');
    }
    if (resumingRef.current) {
      throw new Error('이용을 다시 시작하고 있습니다.');
    }

    // Clear the fail-closed retry before the POST. Otherwise the next poll can
    // turn the successfully resumed session back into an ended session.
    forcedEndRef.current = null;
    resumingRef.current = true;
    resumeRequestedRef.current = current.reservationId;
    setResumePending(true);
    setResumeError(null);
    try {
      const response = await fetch(`${getReservationSessionApiUrl(current.kioskId)}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reservationId: current.reservationId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        const message = body?.detail || '이용을 다시 시작하지 못했습니다.';
        if (response.status === 409) {
          resumeRequestedRef.current = null;
          updateSession({ ...current, canResume: false });
        }
        throw new Error(message);
      }
      const resumed = await response.json() as UsageSession;
      resumeRequestedRef.current = null;
      updateSession(resumed);
      armNaturalEnd(resumed);
      setResumeSignal((value) => value + 1);
      return resumed;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '이용을 다시 시작하지 못했습니다.';
      setResumeError(message);
      throw reason;
    } finally {
      resumingRef.current = false;
      setResumePending(false);
    }
  }, [armNaturalEnd, updateSession]);

  const dismissUsage = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.status === 'active') return;
    const response = await fetch(`${getReservationSessionApiUrl(current.kioskId)}/dismiss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId: current.reservationId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(body?.detail || '이용 종료를 저장하지 못했습니다.');
    }
    dismissedReservationRef.current = current.reservationId;
    forcedEndRef.current = null;
    updateSession(null);
  }, [updateSession]);

  const createFollowup = useCallback(async (request: {
    reservationId: number;
    date: string;
    startTime: string;
    durationMinutes: DurationMinutes;
    roomId: number;
  }): Promise<UsageSession> => {
    const current = sessionRef.current;
    if (!current || current.status !== 'ended') throw new Error('현재 종료된 이용 세션이 없습니다.');
    const booked = await createFollowupReservation(current.kioskId, request);
    updateSession(booked);
    return booked;
  }, [updateSession]);

  useEffect(() => {
    if (!enabled) return;
    const kioskId = getKioskIdFromLocation().toUpperCase();
    if (!SUPPORTED_KIOSKS.has(kioskId)) return;
    let disposed = false;
    let pollTimer: number | null = null;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(getReservationSessionApiUrl(kioskId), {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (disposed) return;
        if (response.status === 204) {
          // 종료/취소가 서버에 반영되면 양쪽 듀얼 스크린 모두 즉시 잠금을 해제한다.
          // 한쪽 창에서 종료 저장이 실패해도 다음 poll은 active 세션을 다시 받아
          // end 재시도를 수행하므로, 204를 ended 상태로 붙잡아 둘 이유가 없다.
          updateSession(null);
        } else if (response.ok) {
          const next = await response.json() as UsageSession;
          if (dismissedReservationRef.current === next.reservationId) {
            updateSession(null);
            return;
          }
          if (dismissedReservationRef.current !== null && dismissedReservationRef.current !== next.reservationId) {
            dismissedReservationRef.current = null;
          }
          const forced = forcedEndRef.current;
          if (forced && forced.reservationId === next.reservationId && next.status === 'active') {
            // Never reopen the English program because a previous end write was lost.
            updateSession(reconcilePolledSession(next, forced));
            void fetch(`${getReservationSessionApiUrl(kioskId)}/end`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reservationId: forced.reservationId, reason: forced.reason }),
            }).then(async (retry) => {
              if (retry.ok) updateSession(await retry.json() as UsageSession);
            }).catch(() => undefined);
            return;
          }
          if (forced && forced.reservationId !== next.reservationId) forcedEndRef.current = null;
          if (resumeRequestedRef.current !== null && resumeRequestedRef.current !== next.reservationId) {
            resumeRequestedRef.current = null;
          }
          if (next.status === 'active') {
            setResumeError(null);
            if (resumeRequestedRef.current === next.reservationId) {
              resumeRequestedRef.current = null;
              setResumeSignal((value) => value + 1);
            }
          }
          updateSession(next);
          armNaturalEnd(next);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.warn('[reservation-followup] status poll failed', error);
        }
      } finally {
        if (!disposed) pollTimer = window.setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      controller?.abort();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      if (endTimerRef.current !== null) window.clearTimeout(endTimerRef.current);
    };
  }, [armNaturalEnd, enabled, endUsage, updateSession]);

  return {
    session,
    endUsage,
    resumeUsage,
    dismissUsage,
    createFollowup,
    endPending,
    resumePending,
    resumeError,
    resumeSignal,
    locked: Boolean(session && session.status !== 'active'),
  };
}
