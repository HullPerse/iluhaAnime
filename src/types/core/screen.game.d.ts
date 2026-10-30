import type { GameSessionRuntime } from "@/types/core/gameSession";
import type { GameTelemetry } from "@/types/core/game";
import type { RefObject } from "react";

export interface GameScreenProps {
  runtime: GameSessionRuntime;
  telemetry: GameTelemetry;
  /** Keys held right now, from physical presses and keypad clicks. */
  pressedKeys: ReadonlySet<number>;
  muted: boolean;
  volume: number;
  cols: number;
  rows: number;
  scale: number;
  expanded: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onStop: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onPressKey: (key: number, pressed: boolean) => void;
  onRetry: () => void;
  onToggleExpanded: () => void;
}
