'use client';

/** Read-aloud recording for pronunciation practice: 16 kHz mono 16-bit WAV, at most a few seconds. */

export const READ_ALOUD_SAMPLE_RATE = 16000;
export const READ_ALOUD_MAX_MS = 7000;

export function encodeWav(samples: Float32Array, sampleRate = READ_ALOUD_SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Blob([buffer], { type: 'audio/wav' });
}

async function toMono16k(recorded: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recorded.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * READ_ALOUD_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, READ_ALOUD_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded; // multi-channel input is down-mixed to the mono destination
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    void context.close();
  }
}

export type ReadAloudRecording = {
  /** Resolves with the WAV to upload and the original recording for "listen to me". */
  finished: Promise<{ wav: Blob; playback: Blob }>;
  stop: () => void;
  cancel: () => void;
};

export async function startReadAloudRecording(maxMs = READ_ALOUD_MAX_MS): Promise<ReadAloudRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let cancelled = false;
  const release = () => stream.getTracks().forEach((track) => track.stop());
  const finished = new Promise<{ wav: Blob; playback: Blob }>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      release();
      reject(new Error('recording failed'));
    };
    recorder.onstop = () => {
      release();
      if (cancelled) {
        reject(new Error('cancelled'));
        return;
      }
      const playback = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      toMono16k(playback).then((samples) => resolve({ wav: encodeWav(samples), playback }), reject);
    };
  });
  const timer = window.setTimeout(() => {
    if (recorder.state === 'recording') recorder.stop();
  }, maxMs);
  recorder.start();
  return {
    finished,
    stop: () => {
      window.clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
    },
    cancel: () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (recorder.state === 'recording') recorder.stop();
      else release();
    },
  };
}
