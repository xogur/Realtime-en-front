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
    expect(vad.push(new Float32Array(14000))?.length).toBe(30000);
    expect(vad.push(new Float32Array(14000))).toBeNull();
  });
  it('discards prior speech when the prompt or turn changes', () => {
    const vad = new OnboardingUtterance();
    vad.push(new Float32Array(4000).fill(0.1));
    vad.reset();
    expect(vad.push(new Float32Array(14000))).toBeNull();
  });
});
