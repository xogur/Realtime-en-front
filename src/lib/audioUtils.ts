
// Convert Float32 (Web Audio API default) to Int16 (Server expectation)
export function floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
}

// Convert Int16 (Server response) to Float32 (Web Audio API playback)
export function int16ToFloat32(input: Int16Array): Float32Array {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const int = input[i];
        // If exact 32768, float is -1.0
        // If 32767, float is ~1.0
        const float = int >= 0 ? int / 0x7FFF : int / 0x8000;
        output[i] = float;
    }
    return output;
}
