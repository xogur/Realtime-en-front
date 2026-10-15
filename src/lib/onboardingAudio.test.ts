import { describe, expect, it } from 'vitest';
import { OnboardingUtterance } from './onboardingAudio';

describe('onboarding utterance boundaries', () => {
  it('ignores silence and short impulses', () => {
    const vad = new OnboardingUtterance();
    expect(vad.push(new Float32Array(16000))).toBeNull();
    expect(vad.push(new Float32Array(128).fill(0.1))).toBeNull();
    expect(vad.push(new Float32Array(14000))).toBeNull();
  });
  it('waits through a short pause and returns one complete utterance', () => {
    const vad = new OnboardingUtterance();
    expect(vad.push(new Float32Array(4000).fill(0.1))).toBeNull();
    expect(vad.push(new Float32Array(8000))).toBeNull();
    expect(vad.push(new Float32Array(4000).fill(0.1))).toBeNull();
    expect(vad.push(new Float32Array(14000))).toBeNull();
    expect(vad.push(new Float32Array(4000))?.length).toBe(34000);
    expect(vad.push(new Float32Array(18000))).toBeNull();
  });
  it('keeps a reply with a one-second pause whole ("김… 민수요")', () => {
    const vad = new OnboardingUtterance();
    expect(vad.push(new Float32Array(4000).fill(0.1))).toBeNull();
    expect(vad.push(new Float32Array(16000))).toBeNull();
    expect(vad.push(new Float32Array(4000).fill(0.1))).toBeNull();
    expect(vad.push(new Float32Array(18000))?.length).toBe(42000);
  });
  it('discards prior speech when the prompt or turn changes', () => {
    const vad = new OnboardingUtterance();
    vad.push(new Float32Array(4000).fill(0.1));
    vad.reset();
    expect(vad.push(new Float32Array(14000))).toBeNull();
  });
  const tone = (samples: number, level: number) => {
    // Alternating samples: an RMS of exactly `level`.
    const audio = new Float32Array(samples);
    for (let i = 0; i < samples; i += 1) audio[i] = i % 2 ? level : -level;
    return audio;
  };
  it('ends a reply in a noisy room instead of running to the 10 s cap', () => {
    const vad = new OnboardingUtterance();
    expect(vad.push(tone(32000, 0.01))).toBeNull(); // the old fixed 0.008 gate called this speech
    expect(vad.push(tone(8000, 0.08))).toBeNull();
    const audio = vad.push(tone(20000, 0.01));
    expect(audio).not.toBeNull();
    expect(audio!.length).toBeLessThan(16000 * 3);
  });
  it('hears a quiet child below the old fixed gate in a quiet room', () => {
    const vad = new OnboardingUtterance();
    expect(vad.push(new Float32Array(16000))).toBeNull();
    expect(vad.push(tone(8000, 0.006))).toBeNull();
    expect(vad.push(new Float32Array(18000))).not.toBeNull();
  });
  it('never sends steady noise that started before the noise floor was known', () => {
    const vad = new OnboardingUtterance();
    expect(vad.push(tone(16000 * 10, 0.02))).toBeNull();
  });
  it('primes a 0.3 s pre-roll while not listening, without starting speech', () => {
    const vad = new OnboardingUtterance();
    vad.prime(tone(16000, 0.1));
    vad.prime(new Float32Array(16000));
    expect(vad.push(tone(4000, 0.1))).toBeNull();
    const audio = vad.push(new Float32Array(18000));
    expect(audio!.length).toBeGreaterThanOrEqual(4800 + 4000 + 17600);
    expect(audio!.length).toBeLessThan(4800 + 128 + 4000 + 18000 + 1);
  });
});
