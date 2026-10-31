export type GamePlatform = "chip8" | "schip" | "schip11" | "xochip";

export type GameRomSource = "builtin" | "user";

export interface GameRomInfo {
  id: string;
  name: string;
  platform: GamePlatform;
  source: GameRomSource;
  author: string | null;
  license: string | null;
  size: number;
}

export type GameStorePlatform = "chip8" | "schip" | "xochip";

export interface GameStoreEntry {
  key: string;
  title: string;
  authors: string[];
  platform: GameStorePlatform;
  description: string;
  howto: string | null;
  size: number;
  installed: boolean;
}

export interface GameStoreProgress {
  key: string;
  received: number;
  total: number;
}

export interface GameStartInfo {
  session: number;
  id: string;
  name: string;
  platform: GamePlatform;
  author: string | null;
  license: string | null;
  howto: string | null;
  cols: number;
  rows: number;
  cyclesPerSecond: number;
  palette: GamePalette | null;
}

export interface GamePalette {
  background: string;
  fill: string;
  fill2: string;
  blend: string;
}

export interface GameAudioBlock {
  pitchHz: number;
  pattern: Uint8Array;
}

export interface GameFrame {
  cols: number;
  rows: number;
  dirty: boolean;
  hires: boolean;
  xo: boolean;
  sound: boolean;
  waitingKey: boolean;
  halted: boolean;
  audio: GameAudioBlock | null;
  pixels: Uint8Array;
}

export interface GameTelemetry {
  fps: number;
  hires: boolean;
  waitingKey: boolean;
  halted: boolean;
}
