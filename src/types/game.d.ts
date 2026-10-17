export type GamePlatform = "chip8" | "schip" | "schip11";

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

/** Platforms the ROM store can list; `xochip` entries cannot run yet. */
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
}

/** Decoded `game_tick` response: flag header plus the packed 1bpp framebuffer. */
export interface GameFrame {
  cols: number;
  rows: number;
  dirty: boolean;
  hires: boolean;
  sound: boolean;
  waitingKey: boolean;
  halted: boolean;
  pixels: Uint8Array;
}

/** Low-rate session telemetry published to React at most twice per second. */
export interface GameTelemetry {
  fps: number;
  hires: boolean;
  waitingKey: boolean;
  halted: boolean;
}
