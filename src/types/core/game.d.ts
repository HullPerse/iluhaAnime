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

/** Platforms the ROM store can list. */
export type GameStorePlatform = "chip8" | "schip" | "xochip";

/** One entry of the bundled chip8Archive index shown in the ROM store. */
export interface GameStoreEntry {
  key: string;
  title: string;
  authors: string[];
  platform: GameStorePlatform;
  description: string;
  /** Archive `howto` text; null for entries without a recorded hint. */
  howto: string | null;
  size: number;
  installed: boolean;
}

/** Streaming `game-store-progress` payload: bytes of one store download. */
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
  /** Controls hint matched by SHA-1 against the store index; null when unknown. */
  howto: string | null;
  cols: number;
  rows: number;
  cyclesPerSecond: number;
  /** XO-CHIP four-colour palette for two-bit frames; null keeps the theme. */
  palette: GamePalette | null;
}

/** XO-CHIP palette: background, first plane, second plane and their overlap. */
export interface GamePalette {
  background: string;
  fill: string;
  fill2: string;
  blend: string;
}

/** XO-CHIP buzzer state carried by every XO `game_tick` response. */
export interface GameAudioBlock {
  /** Playback rate of the 128 one-bit samples, in hertz. */
  pitchHz: number;
  /** Sixteen pattern bytes: 128 bits, most significant bit first. */
  pattern: Uint8Array;
}

/** Decoded `game_tick` response: flag header, optional XO audio block, frame. */
export interface GameFrame {
  cols: number;
  rows: number;
  dirty: boolean;
  hires: boolean;
  /** True for XO-CHIP frames: two bits per pixel in four colours. */
  xo: boolean;
  sound: boolean;
  waitingKey: boolean;
  halted: boolean;
  audio: GameAudioBlock | null;
  pixels: Uint8Array;
}

/** Low-rate session telemetry published to React at most twice per second. */
export interface GameTelemetry {
  fps: number;
  hires: boolean;
  waitingKey: boolean;
  halted: boolean;
}
