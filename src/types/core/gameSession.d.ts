import type { GameAudio } from "@/types/player/audio";
import type { Rgba } from "@/types/core/frame";
import type { AnimationLoopTask } from "@/types/core/interval";
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

export interface ActiveSession {
  session: number;
  token: number;
  cyclesPerSecond: number;
  audio: GameAudio;
  colors: readonly Rgba[];
  loop: AnimationLoopTask;
  releaseKeypad: () => void;
  primed: boolean;
  lastStamp: number;
  telemetryStamp: number;
  inFlight: boolean;
  frames: number;
  cycleCarry: number;
  timerCarryMs: number;
  image: ImageData | null;
  context: CanvasRenderingContext2D | null;
}
