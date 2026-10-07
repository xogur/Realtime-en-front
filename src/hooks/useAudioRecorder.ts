import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@/stores/useStore';
import { floatTo16BitPCM } from '@/lib/audioUtils';
import { MICROPHONE_START_TIMEOUT_MS } from '@/lib/stt';

type WindowWithAudioContext = Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
};

export function useAudioRecorder() {
    const context = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const workletRef = useRef<AudioWorkletNode | null>(null);
    const isStartingRef = useRef(false);
    const isRecordingRef = useRef(false);
    const operationIdRef = useRef(0);
    const captureOperationRef = useRef(0);
    const preparedRef = useRef(false);
    const preparationRef = useRef<Promise<boolean> | null>(null);
    const cleanupPromiseRef = useRef<Promise<void>>(Promise.resolve());
    const startupRef = useRef<{ phase: string; startedAt: number } | null>(null);

    const isRecording = useStore((state) => state.isRecording);
    const setRecording = useStore((state) => state.setRecording);

    const BATCH_SIZE = 2048;
    const audioBufferRef = useRef<Int16Array | null>(null);
    const audioBufferOffsetRef = useRef(0);
    const onDataAvailableRef = useRef<(pcm: Int16Array) => void>(() => { });

    const pauseRecording = useCallback(async () => {
        const worklet = workletRef.current;
        const source = sourceRef.current;
        captureOperationRef.current += 1;
        isStartingRef.current = false;
        workletRef.current = null;
        sourceRef.current = null;
        audioBufferRef.current = null;
        audioBufferOffsetRef.current = 0;
        isRecordingRef.current = false;
        setRecording(false);

        if (worklet) {
            worklet.port.onmessage = null;
            worklet.disconnect();
        }

        if (source) {
            source.disconnect();
        }
    }, [setRecording]);

    const resetAudioPipeline = useCallback(async () => {
        void pauseRecording();
        const activeContext = context.current;
        const stream = streamRef.current;
        context.current = null;
        streamRef.current = null;
        preparedRef.current = false;
        preparationRef.current = null;

        if (stream) {
            stream.getTracks().forEach((track) => {
                track.onended = null;
                track.stop();
            });
        }

        if (activeContext && activeContext.state !== 'closed') {
            await activeContext.close().catch(() => undefined);
        }

    }, [pauseRecording]);

    const queueAudioCleanup = useCallback(() => {
        const previous = cleanupPromiseRef.current;
        // Detach now, but keep every older close barrier before the next start.
        const current = resetAudioPipeline();
        cleanupPromiseRef.current = Promise.all([previous, current]).then(() => undefined);
        return cleanupPromiseRef.current;
    }, [resetAudioPipeline]);

    const prepareRecording = useCallback((input?: MediaStream): Promise<boolean> => {
        if (input && (!input.getAudioTracks()[0] || input.getAudioTracks()[0].readyState === 'ended')) {
            input.getTracks().forEach(track => track.stop());
            return Promise.resolve(false);
        }
        if (input && (preparedRef.current || preparationRef.current)) {
            if (input !== streamRef.current) input.getTracks().forEach(track => track.stop());
        }
        if (preparedRef.current) return Promise.resolve(true);
        if (preparationRef.current) return preparationRef.current;
        if (input) streamRef.current = input;
        const startup = { phase: 'cleanup', startedAt: performance.now() };
        startupRef.current = startup;
        const operationId = operationIdRef.current + 1;
        operationIdRef.current = operationId;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const prepare = async () => {
            try {
                await cleanupPromiseRef.current;
                if (operationId !== operationIdRef.current) return false;

                startup.phase = 'getUserMedia';
                const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: { ideal: 48000 },
                        channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
                if (operationId !== operationIdRef.current) {
                    stream.getTracks().forEach((track) => track.stop());
                    return false;
                }
                streamRef.current = stream;
                stream.getAudioTracks().forEach((track) => {
                    track.onended = () => {
                        if (operationId !== operationIdRef.current) return;
                        operationIdRef.current += 1;
                        isStartingRef.current = false;
                        setRecording(false);
                        void queueAudioCleanup();
                    };
            });

            startup.phase = 'AudioContext';
            const AudioContextCtor = window.AudioContext || (window as WindowWithAudioContext).webkitAudioContext;
            if (!AudioContextCtor) throw new Error('AudioContext is not available in this browser.');
            const actx = new AudioContextCtor({ sampleRate: 48000 });
            context.current = actx;
            if (actx.state === 'suspended') await actx.resume();
            if (operationId !== operationIdRef.current) return false;

            startup.phase = 'AudioWorklet';
            await actx.audioWorklet.addModule('/audio-processor.js');
            if (operationId !== operationIdRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                if (actx.state !== 'closed') await actx.close().catch(() => undefined);
                return false;
            }

            preparedRef.current = true;
            console.info('Microphone prepared', { elapsedMs: Math.round(performance.now() - startup.startedAt) });
            return true;
        } catch (err) {
            if (operationId !== operationIdRef.current) return false;
            console.warn('Microphone capture failed', {
                phase: startup.phase,
                error: err instanceof Error ? err.name : 'UnknownError',
                elapsedMs: Math.round(performance.now() - startup.startedAt),
            });
            await queueAudioCleanup();
            return false;
        }
        };
        const pending = Promise.race([prepare(), new Promise<false>(resolve => {
            timer = setTimeout(() => {
                if (operationId === operationIdRef.current) {
                    operationIdRef.current += 1;
                    void queueAudioCleanup();
                }
                resolve(false);
            }, MICROPHONE_START_TIMEOUT_MS);
        })]).finally(() => {
            if (timer) clearTimeout(timer);
            if (preparationRef.current === pending) preparationRef.current = null;
            if (startupRef.current === startup) startupRef.current = null;
        });
        preparationRef.current = pending;
        return pending;
    }, [queueAudioCleanup, setRecording]);

    const startRecording = useCallback(async (): Promise<boolean> => {
        if (isRecordingRef.current) return true;
        if (isStartingRef.current) return false;
        isStartingRef.current = true;
        const operation = ++captureOperationRef.current;
        try {
            if (!await prepareRecording() || operation !== captureOperationRef.current) return false;
            const actx = context.current;
            const stream = streamRef.current;
            if (!actx || !stream || actx.state === 'closed') return false;
            if (actx.state === 'suspended') await actx.resume();
            if (operation !== captureOperationRef.current) return false;

            const source = actx.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(actx, 'my-audio-processor');

            audioBufferRef.current = new Int16Array(BATCH_SIZE * 4);
            audioBufferOffsetRef.current = 0;

            worklet.port.onmessage = (event) => {
                // A disconnected worklet may still have queued callbacks. Never
                // forward samples from before a pause or from a previous turn.
                if (operation !== captureOperationRef.current || !isRecordingRef.current) return;
                const int16Data = floatTo16BitPCM(event.data);
                let currentBuffer = audioBufferRef.current;
                let currentOffset = audioBufferOffsetRef.current;

                if (!currentBuffer) return;

                if (currentOffset + int16Data.length > currentBuffer.length) {
                    const newBuffer = new Int16Array(currentBuffer.length + BATCH_SIZE * 4);
                    newBuffer.set(currentBuffer);
                    currentBuffer = newBuffer;
                    audioBufferRef.current = currentBuffer;
                }

                currentBuffer.set(int16Data, currentOffset);
                currentOffset += int16Data.length;

                while (currentOffset >= BATCH_SIZE) {
                    const batch = currentBuffer.slice(0, BATCH_SIZE);
                    onDataAvailableRef.current(batch);

                    const remaining = currentBuffer.subarray(BATCH_SIZE, currentOffset);
                    currentBuffer.set(remaining);
                    currentOffset -= BATCH_SIZE;
                }

                audioBufferOffsetRef.current = currentOffset;
            };

            source.connect(worklet);
            worklet.connect(actx.destination);

            sourceRef.current = source;
            workletRef.current = worklet;
            isRecordingRef.current = true;
            setRecording(true);
            return true;
        } catch (err) {
            if (operation !== captureOperationRef.current) return false;
            console.warn('Microphone activation failed', { error: err instanceof Error ? err.name : 'UnknownError' });
            await queueAudioCleanup();
            return false;
        } finally {
            if (operation === captureOperationRef.current) isStartingRef.current = false;
        }
    }, [prepareRecording, queueAudioCleanup, setRecording]);

    const stopRecording = useCallback(async () => {
        if (startupRef.current) {
            console.info('Microphone preparation cancelled', {
                phase: startupRef.current.phase,
                elapsedMs: Math.round(performance.now() - startupRef.current.startedAt),
            });
            startupRef.current = null;
        }
        operationIdRef.current += 1;
        isStartingRef.current = false;
        setRecording(false);
        await queueAudioCleanup();
    }, [queueAudioCleanup, setRecording]);

    useEffect(() => () => { void stopRecording(); }, [stopRecording]);

    const setOnDataAvailable = useCallback((cb: (pcm: Int16Array) => void) => {
        onDataAvailableRef.current = cb;
    }, []);

    return { prepareRecording, startRecording, pauseRecording, stopRecording, setOnDataAvailable, isRecording };
}
