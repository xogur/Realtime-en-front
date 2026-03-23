import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/stores/useStore';
import { floatTo16BitPCM } from '@/lib/audioUtils';

export function useAudioRecorder() {
    const context = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const workletRef = useRef<AudioWorkletNode | null>(null);
    const isRecording = useStore((state) => state.isRecording);
    const setRecording = useStore((state) => state.setRecording);

    const BATCH_SIZE = 2048;
    const audioBufferRef = useRef<Int16Array | null>(null);
    const audioBufferOffsetRef = useRef<number>(0);

    const onDataAvailableRef = useRef<(pcm: Int16Array) => void>(() => { });

    const startRecording = useCallback(async () => {
        try {
            // 1. 마이크 스트림 요청
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: { ideal: 48000 },
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            streamRef.current = stream;

            // 2. AudioContext 생성
            const actx = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 48000
            });
            context.current = actx;

            // [추가된 부분] AudioContext가 일시 정지 상태라면 강제로 실행
            if (actx.state === 'suspended') {
                await actx.resume();
            }

            await actx.audioWorklet.addModule('/audio-processor.js');

            const source = actx.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(actx, 'my-audio-processor');

            // 버퍼 초기화
            audioBufferRef.current = new Int16Array(BATCH_SIZE * 4);
            audioBufferOffsetRef.current = 0;

            worklet.port.onmessage = (event) => {
                // ... 기존 데이터 처리 로직 (floatTo16BitPCM 변환 등) 그대로 유지 ...
                // (위에서 알려드린 수정된 로직을 그대로 사용하시면 됩니다)
                const float32Data = event.data;
                const int16Data = floatTo16BitPCM(float32Data);

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

            workletRef.current = worklet;
            setRecording(true);

        } catch (err) {
            console.error('Mic access denied or AudioContext failed:', err);
            setRecording(false);
        }
    }, [setRecording]);

    // ... stopRecording 등 나머지 코드 동일
    const stopRecording = useCallback(() => {
        if (context.current && context.current.state !== 'closed') {
            context.current.close();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
        audioBufferRef.current = null;
        audioBufferOffsetRef.current = 0;
        setRecording(false);
    }, [setRecording]);

    const setOnDataAvailable = (cb: (pcm: Int16Array) => void) => {
        onDataAvailableRef.current = cb;
    };

    return { startRecording, stopRecording, setOnDataAvailable, isRecording };
}