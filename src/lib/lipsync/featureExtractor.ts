import { BAND_RANGES_HZ } from './constants';
import type { AudioFeatures, FeatureExtractorState } from './types';

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function createFeatureExtractorState(): FeatureExtractorState {
  return {
    previousEnvelope: 0,
    previousBandRatios: new Array(BAND_RANGES_HZ.length).fill(0),
  };
}

export function extractAudioFeatures(
  analyser: AnalyserNode | null,
  frequencyData: Uint8Array,
  timeDomainData: Uint8Array,
  state: FeatureExtractorState,
): AudioFeatures {
  if (!analyser) {
    return {
      sampleRate: 0,
      rms: 0,
      envelope: 0,
      envelopeDelta: 0,
      spectralFlux: 0,
      zcr: 0,
      bands: new Array(BAND_RANGES_HZ.length).fill(0),
      bandRatios: new Array(BAND_RANGES_HZ.length).fill(0),
      centroidHz: 0,
      voicedConfidence: 0,
    };
  }

  const frequencyFrame = new Uint8Array(frequencyData.length);
  const timeDomainFrame = new Uint8Array(timeDomainData.length);
  analyser.getByteFrequencyData(frequencyFrame);
  analyser.getByteTimeDomainData(timeDomainFrame);

  const sampleRate = analyser.context.sampleRate;
  const binCount = frequencyFrame.length;
  const nyquist = sampleRate / 2;

  let rmsAccumulator = 0;
  let zcrAccumulator = 0;
  let previousSample = 0;
  for (let i = 0; i < timeDomainFrame.length; i += 1) {
    const normalized = (timeDomainFrame[i] - 128) / 128;
    rmsAccumulator += normalized * normalized;
    if (i > 0 && Math.sign(normalized) !== Math.sign(previousSample)) {
      zcrAccumulator += 1;
    }
    previousSample = normalized;
  }

  const rms = Math.sqrt(rmsAccumulator / Math.max(1, timeDomainFrame.length));
  const envelope = clamp01(rms * 2.6);
  const envelopeDelta = envelope - state.previousEnvelope;

  const bands = BAND_RANGES_HZ.map(([startHz, endHz]) => {
    const startBin = Math.max(0, Math.floor((startHz / nyquist) * binCount));
    const endBin = Math.min(binCount, Math.ceil((endHz / nyquist) * binCount));
    let sum = 0;
    let count = 0;
    for (let i = startBin; i < endBin; i += 1) {
      sum += frequencyFrame[i];
      count += 1;
    }
    return count > 0 ? sum / count / 255 : 0;
  });

  const totalBandEnergy = bands.reduce((sum, band) => sum + band, 0);
  const bandRatios = totalBandEnergy > 0 ? bands.map((band) => band / totalBandEnergy) : bands.map(() => 0);
  const spectralFlux = bandRatios.reduce(
    (sum, ratio, index) => sum + Math.max(0, ratio - (state.previousBandRatios[index] ?? 0)),
    0,
  );

  let weightedHz = 0;
  let weightedMagnitude = 0;
  for (let i = 0; i < binCount; i += 1) {
    const magnitude = frequencyFrame[i] / 255;
    const hz = (i / binCount) * nyquist;
    weightedHz += hz * magnitude;
    weightedMagnitude += magnitude;
  }
  const centroidHz = weightedMagnitude > 0 ? weightedHz / weightedMagnitude : 0;

  frequencyData.set(frequencyFrame);
  timeDomainData.set(timeDomainFrame);

  const normalizedVoicedConfidence = clamp01(
    envelope * 0.7 + (1 - Math.min(zcrAccumulator / Math.max(1, timeDomainFrame.length / 2), 1)) * 0.3,
  );

  state.previousEnvelope = envelope;
  state.previousBandRatios = bandRatios;

  return {
    sampleRate,
    rms,
    envelope,
    envelopeDelta,
    spectralFlux,
    zcr: zcrAccumulator / Math.max(1, timeDomainFrame.length),
    bands,
    bandRatios,
    centroidHz,
    voicedConfidence: normalizedVoicedConfidence,
  };
}
