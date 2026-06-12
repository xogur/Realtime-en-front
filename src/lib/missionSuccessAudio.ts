import { useSyncExternalStore } from 'react';

export const MISSION_SUCCESS_SOUND_STORAGE_KEY = 'mission-success-sound-enabled';
const MISSION_SUCCESS_SOUND_EVENT = 'mission-success-sound-preference-change';

type BrowserWindow = Window & {
    webkitAudioContext?: typeof AudioContext;
};

export function getMissionSuccessSoundEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(MISSION_SUCCESS_SOUND_STORAGE_KEY) !== 'false';
}

export function setMissionSuccessSoundEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MISSION_SUCCESS_SOUND_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(MISSION_SUCCESS_SOUND_EVENT));
}

function subscribeMissionSuccessSoundPreference(callback: () => void) {
    if (typeof window === 'undefined') return () => undefined;
    const onStorage = (event: StorageEvent) => {
        if (event.key === MISSION_SUCCESS_SOUND_STORAGE_KEY) callback();
    };
    window.addEventListener(MISSION_SUCCESS_SOUND_EVENT, callback);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(MISSION_SUCCESS_SOUND_EVENT, callback);
        window.removeEventListener('storage', onStorage);
    };
}

export function useMissionSuccessSoundEnabled(): [boolean, (enabled: boolean) => void] {
    const enabled = useSyncExternalStore(
        subscribeMissionSuccessSoundPreference,
        getMissionSuccessSoundEnabled,
        () => true,
    );

    return [enabled, setMissionSuccessSoundEnabled];
}

export class MissionSuccessAudio {
    private audioContext: AudioContext | null = null;
    private nodes: AudioScheduledSourceNode[] = [];
    private enabled = true;
    private cleanupInteractionListeners: (() => void) | null = null;

    constructor(enabled = true) {
        this.enabled = enabled;
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) this.cancel();
    }

    bindInteractionUnlock() {
        if (typeof window === 'undefined' || this.cleanupInteractionListeners) return;
        const unlock = () => {
            void this.ensureContext();
        };
        window.addEventListener('pointerdown', unlock, { passive: true });
        window.addEventListener('keydown', unlock);
        this.cleanupInteractionListeners = () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }

    async play() {
        if (!this.enabled || typeof window === 'undefined' || document.visibilityState !== 'visible') return;
        const audioContext = await this.ensureContext();
        if (!audioContext) return;

        try {
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            if (audioContext.state !== 'running') return;
            this.cancel();

            const startAt = audioContext.currentTime + 0.015;
            const chord = [523.25, 659.25, 783.99, 1046.5];

            chord.forEach((frequency, index) => {
                this.playTone(audioContext, frequency, startAt + index * 0.045, 0.17, 0.04, 'triangle');
            });
            this.playTone(audioContext, 1567.98, startAt + 0.1, 0.12, 0.018, 'sine');
        } catch {
            // Audio can be blocked by browser policy; visual mission success remains authoritative.
        }
    }

    cancel() {
        this.nodes.forEach((node) => {
            try {
                node.stop();
            } catch {
                // Already stopped.
            }
        });
        this.nodes = [];
    }

    dispose() {
        this.cancel();
        this.cleanupInteractionListeners?.();
        this.cleanupInteractionListeners = null;
        const context = this.audioContext;
        this.audioContext = null;
        if (context && context.state !== 'closed') {
            void context.close().catch(() => undefined);
        }
    }

    private async ensureContext(): Promise<AudioContext | null> {
        if (!this.enabled || typeof window === 'undefined') return null;
        if (this.audioContext && this.audioContext.state !== 'closed') return this.audioContext;

        try {
            const AudioContextClass = window.AudioContext || (window as BrowserWindow).webkitAudioContext;
            if (!AudioContextClass) return null;
            this.audioContext = new AudioContextClass();
            return this.audioContext;
        } catch {
            return null;
        }
    }

    private playTone(
        audioContext: AudioContext,
        frequency: number,
        startAt: number,
        duration: number,
        peakGain: number,
        type: OscillatorType,
    ) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + duration + 0.02);
        this.nodes.push(oscillator);
    }
}
