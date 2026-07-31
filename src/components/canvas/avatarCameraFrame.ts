export type AvatarCameraFrame = {
    fov: number;
    position: readonly [number, number, number];
    target: readonly [number, number, number];
};

const LANDSCAPE_FRAME: AvatarCameraFrame = {
    fov: 35,
    position: [0, 2.3, 1.35],
    target: [0, 2.3, 0],
};

const PORTRAIT_FRAME: AvatarCameraFrame = {
    // Keep a portrait close-up without turning it into a face-only crop.
    fov: 33,
    position: [0, 2.38, 1.512],
    target: [0, 2.38, 0],
};

const NARROW_PORTRAIT_FRAME: AvatarCameraFrame = {
    fov: 31,
    position: [0, 2.44, 1.344],
    target: [0, 2.44, 0],
};

/**
 * Keep the existing landscape framing unchanged, while treating portrait
 * viewports as a speaker close-up instead of showing the full-body scene.
 */
export function getAvatarCameraFrame(width: number, height: number): AvatarCameraFrame {
    const aspect = width / Math.max(height, 1);

    if (aspect < 0.5) return NARROW_PORTRAIT_FRAME;
    if (aspect < 1) return PORTRAIT_FRAME;
    return LANDSCAPE_FRAME;
}
