// public/audio-processor.js
class PcmWorkletProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            // [핵심] 변환하지 말고 Float32 그대로 보냅니다.
            // 변환은 useAudioRecorder.ts에서 수행합니다.
            this.port.postMessage(input[0]);
        }
        return true;
    }
}

registerProcessor('my-audio-processor', PcmWorkletProcessor);