/** Utterance boundaries, not linguistic decisions. PCM is always 16 kHz mono. */
export class OnboardingUtterance {
  private chunks: Float32Array[] = [];
  private samples = 0;
  private voiced = 0;
  private silent = 0;
  private preRoll: Float32Array[] = [];

  reset() {
    this.chunks = [];
    this.samples = this.voiced = this.silent = 0;
    this.preRoll = [];
  }

  push(chunk: Float32Array): Float32Array | null {
    const rms = Math.sqrt(chunk.reduce((sum, value) => sum + value * value, 0) / chunk.length);
    const speech = rms >= 0.008;
    if (!this.chunks.length && !speech) {
      this.preRoll.push(chunk);
      while (this.preRoll.reduce((sum, part) => sum + part.length, 0) > 3200) this.preRoll.shift();
      return null;
    }
    if (!this.chunks.length) {
      this.chunks = this.preRoll;
      this.samples = this.chunks.reduce((sum, part) => sum + part.length, 0);
      this.preRoll = [];
    }
    this.chunks.push(chunk);
    this.samples += chunk.length;
    this.voiced += speech ? chunk.length : 0;
    this.silent = speech ? 0 : this.silent + chunk.length;
    if (this.silent < 16000 * 0.85 && this.samples < 16000 * 10) return null;
    let audio: Float32Array | null = null;
    if (this.voiced >= 16000 * 0.18) {
      audio = new Float32Array(this.samples);
      let offset = 0;
      for (const part of this.chunks) { audio.set(part, offset); offset += part.length; }
    }
    this.reset();
    return audio;
  }
}
