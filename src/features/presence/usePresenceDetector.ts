'use client';

import { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useState } from 'react';
import { hasPersonDetection, PERSON_DETECTION_CONFIDENCE } from './personDetection';

export type PresenceStatus = 'disabled' | 'starting' | 'ready' | 'present' | 'unavailable';

const DETECTION_INTERVAL_MS = 250;
const PRESENCE_TTL_MS = 5_000;
const REQUIRED_POSITIVE_FRAMES = 2;

export function usePresenceDetector(enabled: boolean) {
  const [status, setStatus] = useState<PresenceStatus>(enabled ? 'starting' : 'disabled');
  const [present, setPresent] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => setRetryToken((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      setPresent(false);
      return;
    }

    let disposed = false;
    let stream: MediaStream | null = null;
    let detector: ObjectDetector | null = null;
    let video: HTMLVideoElement | null = null;
    let timer: number | null = null;
    let positiveFrames = 0;
    let lastPositiveAt = 0;

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
          if (disposed || !video || !detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          try {
            const result = detector.detectForVideo(video, performance.now());
            if (hasPersonDetection(result.detections)) {
              positiveFrames += 1;
              if (positiveFrames >= REQUIRED_POSITIVE_FRAMES) {
                lastPositiveAt = Date.now();
                setPresent(true);
                setStatus('present');
              }
              return;
            }
            positiveFrames = 0;
            if (lastPositiveAt > 0 && Date.now() - lastPositiveAt > PRESENCE_TTL_MS) {
              lastPositiveAt = 0;
              setPresent(false);
              setStatus('ready');
            }
          } catch (error) {
            console.warn('[presence] detection failed', error);
          }
        }, DETECTION_INTERVAL_MS);
      } catch (error) {
        if (!disposed) {
          console.warn('[presence] unavailable', error);
          setStatus('unavailable');
          setPresent(false);
        }
        stop();
      }
    };

    void start();
    return () => {
      disposed = true;
      stop();
    };
  }, [enabled, retryToken]);

  return { status, present, retry };
}
