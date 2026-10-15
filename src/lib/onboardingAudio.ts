/**
 * Silence that ends an utterance. Korean names and answers often pause about
 * 1 s mid-reply ("김… 민수요"); 0.85 s split them. Chrome recognition on the
 * same screens waited 1.5 s, so 1.1 s keeps replies whole and still answers sooner.
 */
export const UTTERANCE_END_SILENCE_SECONDS = 1.1;

const SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 128; // One AudioWorklet render quantum (8 ms).
const PRE_ROLL_SAMPLES = SAMPLE_RATE * 0.3;
const MAX_UTTERANCE_SAMPLES = SAMPLE_RATE * 10;
const MIN_VOICED_SAMPLES = SAMPLE_RATE * 0.18;
const END_SILENCE_SAMPLES = SAMPLE_RATE * UTTERANCE_END_SILENCE_SECONDS;
// Levels are averaged over 32 ms so one noisy frame cannot start or prolong speech.
const SMOOTHING_FRAMES = 4;
// Speech needs this many loud frames in a row to cancel the end-of-utterance silence.
const SPEECH_RUN_FRAMES = 2;
// Room noise floor: the quietest level over the last 1.6 s (minimum statistics), which
// tracks a fan or a busy room but ignores the speech in between.
const FLOOR_BLOCK_FRAMES = 25;
const FLOOR_BLOCKS = 8;
const INITIAL_FLOOR = 0.002;
const MIN_FLOOR = 0.0005;
const MAX_FLOOR = 0.05;
// Speech starts 2x (~6 dB) above the floor and continues while 1.5x (~3.5 dB) above it:
// the best of 3/2, 2.5/1.8 and 2/1.5 on Korean replies in quiet, room and busy noise, and
// 12 s of noise alone was never sent. The absolute minimums (about -46/-49 dBFS) still hear
// a quiet child that the old fixed 0.008 (-42 dBFS) gate missed.
const START_OVER_FLOOR = 2;
const CONTINUE_OVER_FLOOR = 1.5;
const MIN_START_LEVEL = 0.005;
const MIN_CONTINUE_LEVEL = 0.0035;

/** Utterance boundaries, not linguistic decisions. PCM is always 16 kHz mono. */
export class OnboardingUtterance {
  private chunks: Float32Array[] = [];
  private levels: number[] = [];
  private samples = 0;
  private silent = 0;
  private speechRun = 0;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private energies: number[] = [];
  private floorBlocks: number[] = [];
  private blockMin = Infinity;
  private blockFrames = 0;

  /** Drops speech and pre-roll (a prompt or turn changed). The room's noise floor stays. */
  reset() {
    this.endUtterance();
    this.preRoll = [];
    this.preRollSamples = 0;
    this.energies = [];
  }

  /**
   * Room audio while not listening: keeps the pre-roll and noise floor current so the
   * first syllable after listening starts is kept. Never starts an utterance.
   */
  prime(chunk: Float32Array) {
    if (this.chunks.length) return;
    for (let offset = 0; offset < chunk.length; offset += FRAME_SAMPLES) {
      const frame = chunk.subarray(offset, offset + FRAME_SAMPLES);
      this.observe(frame);
      this.keepPreRoll(frame);
    }
  }

  push(chunk: Float32Array): Float32Array | null {
    for (let offset = 0; offset < chunk.length; offset += FRAME_SAMPLES) {
      const frame = chunk.subarray(offset, offset + FRAME_SAMPLES);
      const level = this.observe(frame);
      const floor = this.floor();
      if (!this.chunks.length) {
        if (level < Math.max(MIN_START_LEVEL, floor * START_OVER_FLOOR)) {
          this.keepPreRoll(frame);
          continue;
        }
        this.chunks = this.preRoll;
        this.levels = this.preRoll.map(() => 0);
        this.samples = this.preRollSamples;
        this.preRoll = [];
        this.preRollSamples = 0;
      }
      this.chunks.push(frame);
      this.levels.push(level);
      this.samples += frame.length;
      if (level >= Math.max(MIN_CONTINUE_LEVEL, floor * CONTINUE_OVER_FLOOR)) {
        this.speechRun += 1;
        if (this.speechRun >= SPEECH_RUN_FRAMES) this.silent = 0;
      } else {
        this.speechRun = 0;
        this.silent += frame.length;
      }
    }
    if (!this.chunks.length
      || (this.silent < END_SILENCE_SAMPLES && this.samples < MAX_UTTERANCE_SAMPLES)) return null;
    // Judge speech against the floor learned by the end: noise that started an utterance
    // before the floor caught up does not count as voiced.
    const start = Math.max(MIN_START_LEVEL, this.floor() * START_OVER_FLOOR);
    let voiced = 0;
    this.levels.forEach((level, index) => { if (level >= start) voiced += this.chunks[index].length; });
    let audio: Float32Array | null = null;
    if (voiced >= MIN_VOICED_SAMPLES) {
      audio = new Float32Array(this.samples);
      let offset = 0;
      for (const part of this.chunks) { audio.set(part, offset); offset += part.length; }
    }
    this.endUtterance();
    return audio;
  }

  private endUtterance() {
    this.chunks = [];
    this.levels = [];
    this.samples = this.silent = this.speechRun = 0;
  }

  private observe(frame: Float32Array): number {
    let sum = 0;
    for (const value of frame) sum += value * value;
    this.energies.push(frame.length ? sum / frame.length : 0);
    if (this.energies.length > SMOOTHING_FRAMES) this.energies.shift();
    const level = Math.sqrt(this.energies.reduce((total, value) => total + value, 0) / this.energies.length);
    this.blockMin = Math.min(this.blockMin, level);
    this.blockFrames += 1;
    if (this.blockFrames >= FLOOR_BLOCK_FRAMES) {
      this.floorBlocks.push(this.blockMin);
      if (this.floorBlocks.length > FLOOR_BLOCKS) this.floorBlocks.shift();
      this.blockMin = Infinity;
      this.blockFrames = 0;
    }
    return level;
  }

  private floor(): number {
    // Until one full block is seen there is no estimate: speech straight after the
    // microphone opens must not become its own floor.
    if (!this.floorBlocks.length) return INITIAL_FLOOR;
    const lowest = Math.min(this.blockMin, ...this.floorBlocks);
    return Math.min(MAX_FLOOR, Math.max(MIN_FLOOR, lowest));
  }

  private keepPreRoll(frame: Float32Array) {
    this.preRoll.push(frame);
    this.preRollSamples += frame.length;
    while (this.preRollSamples - this.preRoll[0].length >= PRE_ROLL_SAMPLES) {
      this.preRollSamples -= this.preRoll.shift()!.length;
    }
  }
}
