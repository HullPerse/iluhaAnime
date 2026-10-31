export type GameAudioMode = "beep" | "wavetable";

export interface GameAudio {
  setActive: (active: boolean) => void;
  setVolume: (volume: number) => void;
  setWavetable: (pitchHz: number, pattern: Uint8Array) => void;
  dispose: () => void;
}
