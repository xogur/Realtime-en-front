import { useCallback, useRef } from 'react';
import { useStore } from '@/stores/useStore';
import { floatTo16BitPCM } from '@/lib/audioUtils';

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

    const isRecording = useStore((state) => state.isRecording);
    const setRecording = useStore((state) => state.setRecording);

    const BATCH_SIZE = 2048;
    const audioBufferRef = useRef<Int16Array | null>(null);
    const audioBufferOffsetRef = useRef(0);
    const onDataAvailableRef = useRef<(pcm: Int16Array) => void>(() => { });

    const resetAudioPipeline = useCallback(() => {
        if (workletRef.current) {
            workletRef.current.port.onmessage = null;
            workletRef.current.disconnect();
            workletRef.current = null;
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }

        if (context.current && context.current.state !== 'closed') {
            void context.current.close();
        }
        context.current = null;

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        audioBufferRef.current = null;
        audioBufferOffsetRef.current = 0;
        isRecordingRef.current = false;
    }, []);

    const startRecording = useCallback(async () => {
        if (isStartingRef.current || isRecordingRef.current || useStore.getState().isRecording) {
            return;
        }

        isStartingRef.current = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: { ideal: 48000 },
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            streamRef.current = stream;

            const AudioContextCtor = window.AudioContext || (window as WindowWithAudioContext).webkitAudioContext;
            if (!AudioContextCtor) {
                throw new Error('AudioContext is not available in this browser.');
            }

            const actx = new AudioContextCtor({
                sampleRate: 48000,
            });
            context.current = actx;

            if (actx.state === 'suspended') {
                await actx.resume();
            }

            await actx.audioWorklet.addModule('/audio-processor.js');

            const source = actx.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(actx, 'my-audio-processor');

            audioBufferRef.current = new Int16Array(BATCH_SIZE * 4);
            audioBufferOffsetRef.current = 0;

            worklet.port.onmessage = (event) => {
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
        } catch (err) {
            console.error('Mic access denied or AudioContext failed:', err);
            resetAudioPipeline();
            setRecording(false);
        } finally {
            isStartingRef.current = false;
        }
    }, [resetAudioPipeline, setRecording]);

    const stopRecording = useCallback(() => {
        resetAudioPipeline();
        isStartingRef.current = false;
        setRecording(false);
    }, [resetAudioPipeline, setRecording]);

    const setOnDataAvailable = useCallback((cb: (pcm: Int16Array) => void) => {
        onDataAvailableRef.current = cb;
    }, []);

    return { startRecording, stopRecording, setOnDataAvailable, isRecording };
}
