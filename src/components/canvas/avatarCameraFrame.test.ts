import { describe, expect, it } from 'vitest';
import { getAvatarCameraFrame } from './avatarCameraFrame';

describe('getAvatarCameraFrame', () => {
    it('preserves the current landscape composition', () => {
        expect(getAvatarCameraFrame(1920, 1080)).toEqual({
            fov: 35,
            position: [0, 2.3, 1.35],
            target: [0, 2.3, 0],
        });
    });

    it('uses a tighter and higher upper-body framing in portrait', () => {
        const landscape = getAvatarCameraFrame(1920, 1080);
        const portrait = getAvatarCameraFrame(1080, 1920);

        expect(portrait.fov).toBeLessThan(landscape.fov);
        expect(portrait.target[1]).toBeGreaterThan(landscape.target[1]);
        expect(portrait.position[2]).toBeCloseTo(1.512);
    });

    it('tightens the crop further for very narrow portrait displays', () => {
        const portrait = getAvatarCameraFrame(1080, 1920);
        const narrowPortrait = getAvatarCameraFrame(375, 812);

        expect(narrowPortrait.position[2]).toBeCloseTo(1.344);
        expect(narrowPortrait.fov).toBeLessThan(portrait.fov);
        expect(narrowPortrait.target[1]).toBeGreaterThan(portrait.target[1]);
    });
});
