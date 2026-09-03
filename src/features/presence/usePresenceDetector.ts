'use client';

import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addPresenceEvidence,
  createPresenceEvidenceState,
  evaluatePersonFrame,
  PERSON_DETECTION_CONFIDENCE,
  type PresenceEvidenceSummary,
} from './personDetection';

export type PresenceStatus = 'disabled' | 'starting' | 'ready' | 'present' | 'unavailable';

const DETECTION_INTERVAL_MS = 250;
const MAX_CONSECUTIVE_DETECTION_FAILURES = 3;
const FROZEN_VIDEO_TIMEOUT_MS = 2_000;
const DETECTOR_AUTO_RETRY_MS = 3_000;

const EMPTY_EVIDENCE: PresenceEvidenceSummary = {
  confirmed: false,
  sampleCount: 0,
  positiveCount: 0,
  evidenceScore: 0,
  maxConfidence: 0,
  durationMs: 0,
  lastPositiveAtMs: null,
};

export function usePresenceDetector(enabled: boolean) {
  const [status, setStatus] = useState<PresenceStatus>(enabled ? 'starting' : 'disabled');
  const [present, setPresent] = useState(false);
  const evidenceRef = useRef<PresenceEvidenceSummary>(EMPTY_EVIDENCE);
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);
  const getEvidence = useCallback(() => evidenceRef.current, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      setPresent(false);
      evidenceRef.current = EMPTY_EVIDENCE;
      return;
    }

    setStatus('starting');
    setPresent(false);
    evidenceRef.current = EMPTY_EVIDENCE;

    let disposed = false;
    let stream: MediaStream | null = null;
    let detector: ObjectDetector | null = null;
    let video: HTMLVideoElement | null = null;
    let timer: number | null = null;
    let retryTimer: number | null = null;
    let evidenceState = createPresenceEvidenceState();
    let consecutiveDetectionFailures = 0;
    let lastVideoTime = -1;
    let lastVideoAdvancedAtMs = performance.now();

    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      detector?.close();
      detector = null;
      if (video) {
        video.pause();
        video.srcObject = null;
        video.remove();
      }
      video = null;
    };

    const markUnavailableAndRetry = () => {
      evidenceState = createPresenceEvidenceState();
      evidenceRef.current = EMPTY_EVIDENCE;
      setPresent(false);
      setStatus('unavailable');
      stop();
      if (!disposed && retryTimer === null) {
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          setRetryToken((value) => value + 1);
        }, DETECTOR_AUTO_RETRY_MS);
      }
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('media input unavailable');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 15, max: 24 },
          },
        });
        if (disposed) {
          stop();
          return;
        }

        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('aria-hidden', 'true');
        Object.assign(video.style, {
          position: 'fixed',
          width: '1px',
          height: '1px',
          opacity: '0',
          pointerEvents: 'none',
          left: '-10px',
          top: '-10px',
        });
        video.srcObject = stream;
        document.body.appendChild(video);
        await video.play();

        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/models/efficientdet_lite0.tflite' },
          runningMode: 'VIDEO',
          categoryAllowlist: ['person'],
          maxResults: 2,
          scoreThreshold: PERSON_DETECTION_CONFIDENCE,
        });
        if (disposed) {
          stop();
          return;
        }
        setStatus('ready');

        timer = window.setInterval(() => {
          if (disposed || !video || !detector) return;
          if (!stream?.getVideoTracks().some((track) => track.readyState === 'live')) {
            markUnavailableAndRetry();
            return;
          }
          const checkedAtMs = performance.now();
          if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            || video.currentTime === lastVideoTime
          ) {
            if (checkedAtMs - lastVideoAdvancedAtMs >= FROZEN_VIDEO_TIMEOUT_MS) {
              markUnavailableAndRetry();
            }
            return;
          }
          lastVideoTime = video.currentTime;
          lastVideoAdvancedAtMs = checkedAtMs;
          try {
            const capturedAtMs = checkedAtMs;
            const result = detector.detectForVideo(video, capturedAtMs);
            consecutiveDetectionFailures = 0;
            const next = addPresenceEvidence(
              evidenceState,
              evaluatePersonFrame(result.detections, video.videoWidth, video.videoHeight),
              capturedAtMs,
            );
            evidenceState = next.state;
            evidenceRef.current = next.summary;
            setPresent(next.summary.confirmed);
            setStatus(next.summary.confirmed ? 'present' : 'ready');
          } catch (error) {
            console.warn('[presence] detection failed', error);
            consecutiveDetectionFailures += 1;
            evidenceState = createPresenceEvidenceState();
            evidenceRef.current = EMPTY_EVIDENCE;
            setPresent(false);
            if (consecutiveDetectionFailures >= MAX_CONSECUTIVE_DETECTION_FAILURES) {
              markUnavailableAndRetry();
            } else {
              setStatus('ready');
            }
          }
        }, DETECTION_INTERVAL_MS);
      } catch (error) {
        if (!disposed) {
          console.warn('[presence] unavailable', error);
          setStatus('unavailable');
          setPresent(false);
          evidenceRef.current = EMPTY_EVIDENCE;
        }
        stop();
      }
    };

    void start();
    return () => {
      disposed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      stop();
    };
  }, [enabled, retryToken]);

  return { status, present, getEvidence, retry };
}
