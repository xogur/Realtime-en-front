import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  IDLE_ANIMATION_WEIGHTS,
  isOneShotIdleAnimation,
  prepareAnimationAction,
  shouldAdvanceIdleAfterFinish,
} from './animationUtils';

function createAction(duration = 1) {
  const mixer = new THREE.AnimationMixer(new THREE.Object3D());
  const clip = new THREE.AnimationClip('test-clip', duration, []);
  return { mixer, action: mixer.clipAction(clip) };
}

describe('avatar animation playback policy', () => {
  it('reduces the head-motion idle variation weights', () => {
    expect(IDLE_ANIMATION_WEIGHTS.m_idle_var_01).toBe(0.25);
    expect(IDLE_ANIMATION_WEIGHTS.m_idle_var_02).toBe(0.5);
  });

  it('plays idle variations once and holds their final pose', () => {
    const { mixer, action } = createAction();
    let finishCount = 0;
    mixer.addEventListener('finished', () => {
      finishCount += 1;
    });

    expect(isOneShotIdleAnimation('m_idle_var_06')).toBe(true);
    expect(prepareAnimationAction(action, 'idle', 'm_idle_var_06')).toBe(true);

    action.play();
    mixer.update(1.1);

    expect(action.loop).toBe(THREE.LoopOnce);
    expect(action.repetitions).toBe(1);
    expect(action.clampWhenFinished).toBe(true);
    expect(action.paused).toBe(true);
    expect(action.time).toBe(1);

    mixer.update(1.1);
    expect(finishCount).toBe(1);
  });

  it('resets a completed variation so it can be selected again later', () => {
    const { mixer, action } = createAction();

    prepareAnimationAction(action, 'idle', 'm_idle_var_02');
    action.play();
    mixer.update(1.1);
    expect(action.paused).toBe(true);

    prepareAnimationAction(action, 'idle', 'm_idle_var_02');

    expect(action.paused).toBe(false);
    expect(action.enabled).toBe(true);
    expect(action.time).toBe(0);
  });

  it('keeps base idle and talking animations loopable', () => {
    const baseIdle = createAction().action;
    const talking = createAction().action;

    expect(isOneShotIdleAnimation('m_idle_01')).toBe(false);
    expect(prepareAnimationAction(baseIdle, 'idle', 'm_idle_01')).toBe(false);
    expect(prepareAnimationAction(talking, 'talking', 'm_talk_01')).toBe(false);

    expect(baseIdle.loop).toBe(THREE.LoopRepeat);
    expect(baseIdle.repetitions).toBe(Infinity);
    expect(baseIdle.clampWhenFinished).toBe(false);
    expect(talking.loop).toBe(THREE.LoopRepeat);
  });

  it('advances only for the current idle action while TTS is stopped', () => {
    const current = createAction().action;
    const stale = createAction().action;

    expect(shouldAdvanceIdleAfterFinish(current, current, false, 'm_idle_var_06')).toBe(true);
    expect(shouldAdvanceIdleAfterFinish(stale, current, false, 'm_idle_var_06')).toBe(false);
    expect(shouldAdvanceIdleAfterFinish(current, current, true, 'm_idle_var_06')).toBe(false);
    expect(shouldAdvanceIdleAfterFinish(current, current, false, 'm_idle_01')).toBe(false);
  });
});
