export type GameAudioMode = "beep" | "wavetable";

export interface GameAudio {
  /** Follows the VM sound flag; a no-op when the state does not change. */
  setActive: (active: boolean) => void;
  /** Output level 0..1; multiplies the base gain of both modes. */
  setVolume: (volume: number) => void;
  /** XO-CHIP buzzer state; ignored by beep sessions. */
  setWavetable: (pitchHz: number, pattern: Uint8Array) => void;
  dispose: () => void;
}
