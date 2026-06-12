// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getMissionSuccessSoundEnabled,
    MISSION_SUCCESS_SOUND_STORAGE_KEY,
    MissionSuccessAudio,
    setMissionSuccessSoundEnabled,
} from './missionSuccessAudio';

const stopMock = vi.fn();
const closeMock = vi.fn(() => Promise.resolve());
const resumeMock = vi.fn(() => Promise.resolve());
const startMock = vi.fn();
const connectMock = vi.fn(function connect() {
    return this;
});
const setValueAtTimeMock = vi.fn();
const exponentialRampToValueAtTimeMock = vi.fn();

class FakeAudioContext {
    static instances: FakeAudioContext[] = [];
    currentTime = 1;
    destination = {};
    state: AudioContextState = 'running';
    close = closeMock;
    resume = resumeMock;

    constructor() {
        FakeAudioContext.instances.push(this);
    }

    createOscillator() {
        return {
            type: 'sine',
            frequency: { setValueAtTime: setValueAtTimeMock },
            connect: connectMock,
            start: startMock,
            stop: stopMock,
        };
    }

    createGain() {
        return {
            gain: {
                setValueAtTime: setValueAtTimeMock,
                exponentialRampToValueAtTime: exponentialRampToValueAtTimeMock,
            },
            connect: connectMock,
        };
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    FakeAudioContext.instances = [];
    window.localStorage.clear();
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
    });
    Object.defineProperty(window, 'AudioContext', {
        configurable: true,
        value: FakeAudioContext,
    });
});

afterEach(() => {
    window.localStorage.clear();
});

describe('mission success sound preference', () => {
    it('defaults to enabled and persists disabled state', () => {
        expect(getMissionSuccessSoundEnabled()).toBe(true);

        setMissionSuccessSoundEnabled(false);

        expect(window.localStorage.getItem(MISSION_SUCCESS_SOUND_STORAGE_KEY)).toBe('false');
        expect(getMissionSuccessSoundEnabled()).toBe(false);
    });
});

describe('MissionSuccessAudio', () => {
    it('schedules a short success chord when enabled and visible', async () => {
        const audio = new MissionSuccessAudio(true);

        await audio.play();

        expect(FakeAudioContext.instances).toHaveLength(1);
        expect(startMock).toHaveBeenCalled();
        expect(stopMock).toHaveBeenCalled();
        expect(exponentialRampToValueAtTimeMock).toHaveBeenCalledWith(0.16, expect.any(Number));
        audio.dispose();
    });

    it('schedules a brighter tier promotion fanfare', async () => {
        const audio = new MissionSuccessAudio(true);

        await audio.playTierPromotion();

        expect(FakeAudioContext.instances).toHaveLength(1);
        expect(startMock).toHaveBeenCalledTimes(9);
        expect(setValueAtTimeMock).toHaveBeenCalledWith(2093, expect.any(Number));
        expect(exponentialRampToValueAtTimeMock).toHaveBeenCalledWith(0.24, expect.any(Number));
        audio.dispose();
    });

    it('does not create an AudioContext when disabled', async () => {
        const audio = new MissionSuccessAudio(false);

        await audio.play();

        expect(FakeAudioContext.instances).toHaveLength(0);
    });

    it('resumes suspended contexts before scheduling', async () => {
        const audio = new MissionSuccessAudio(true);
        await audio.play();
        FakeAudioContext.instances[0].state = 'suspended';

        await audio.play();

        expect(resumeMock).toHaveBeenCalled();
    });

    it('fails silently when resume is rejected', async () => {
        resumeMock.mockRejectedValueOnce(new Error('blocked'));
        const audio = new MissionSuccessAudio(true);
        await audio.play();
        FakeAudioContext.instances[0].state = 'suspended';

        await expect(audio.play()).resolves.toBeUndefined();
    });

    it('cancels scheduled nodes and closes the context on dispose', async () => {
        const audio = new MissionSuccessAudio(true);
        await audio.play();

        audio.dispose();

        expect(stopMock).toHaveBeenCalled();
        expect(closeMock).toHaveBeenCalled();
    });
});
