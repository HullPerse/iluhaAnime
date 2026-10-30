import type { GameRomInfo, GameStartInfo, GameTelemetry } from "@/types/game";
import type { RefObject } from "react";

export type GameSessionStatus = "idle" | "starting" | "running" | "error";

export interface GameSessionRuntime {
  status: GameSessionStatus;
  info: GameStartInfo | null;
  error: string | null;
}

export interface GameSessionOptions {
  canvas: RefObject<HTMLCanvasElement | null>;
  muted: boolean;
  volume: number;
}

export interface GameSessionHandle {
  runtime: GameSessionRuntime;
  telemetry: GameTelemetry;
  /** Emulator keys held right now, from physical presses and keypad clicks. */
  pressedKeys: ReadonlySet<number>;
  start: (rom: GameRomInfo) => Promise<void>;
  stop: () => void;
  /** Emulator key path for UI keypad clicks; inert without a running session. */
  pressKey: (key: number, pressed: boolean) => void;
}
