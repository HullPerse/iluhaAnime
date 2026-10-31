import type { GameRomInfo, GameStartInfo, GameTelemetry } from "@/types/core/game";
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
  pressedKeys: ReadonlySet<number>;
  start: (rom: GameRomInfo) => Promise<void>;
  stop: () => void;
  pressKey: (key: number, pressed: boolean) => void;
}
