import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { gameApi } from "@/api/game.api";
import { GAME_DISPLAY } from "@/config/game/display.config";
import { GAME_KEY_BY_CODE } from "@/config/game/keypad.config";
import { createGameAudio } from "@/lib/game/audio.utils";
import type { GameAudio } from "@/lib/game/audio.utils";
import { decodeGameFrame, expandFrame, tryParseHexColor } from "@/lib/game/frame.utils";
import { subscribeKeypad } from "@/lib/hotkeys/keypad.hotkeys";
import { createAnimationLoop } from "@/lib/pacer/interval.utils";
import type { AnimationLoopTask } from "@/lib/pacer/interval.utils";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import type { GameFrame, GameRomInfo, GameStartInfo, GameTelemetry } from "@/types/game";

export type GameSessionStatus = "idle" | "starting" | "running" | "error";

export interface GameSessionRuntime {
  status: GameSessionStatus;
  info: GameStartInfo | null;
  error: string | null;
}

export interface GameSessionOptions {
  canvas: RefObject<HTMLCanvasElement | null>;
  muted: boolean;
}

export interface GameSessionHandle {
  runtime: GameSessionRuntime;
  telemetry: GameTelemetry;
  start: (rom: GameRomInfo) => Promise<void>;
  stop: () => void;
}

const PALETTE = {
  on: tryParseHexColor(GAME_DISPLAY.pixel, [255, 255, 255, 255]),
  off: tryParseHexColor(GAME_DISPLAY.background, [0, 0, 0, 255]),
} as const;

const IDLE_RUNTIME: GameSessionRuntime = { status: "idle", info: null, error: null };
const IDLE_TELEMETRY: GameTelemetry = { fps: 0, hires: false, waitingKey: false, halted: false };

interface ActiveSession {
  session: number;
  cyclesPerSecond: number;
  audio: GameAudio;
  loop: AnimationLoopTask;
  releaseKeypad: () => void;
  /** First raf frame only stamps the clock; cycles start on the next one. */
  primed: boolean;
  lastStamp: number;
  telemetryStamp: number;
  inFlight: boolean;
  frames: number;
  /** Fractional cycles not yet delivered; keeps CPS exact on short raf frames. */
  cycleCarry: number;
  /** Fractional timer budget in ms; emits one tick once it reaches `frameTickMs`. */
  timerCarryMs: number;
  image: ImageData | null;
  context: CanvasRenderingContext2D | null;
}

/**
 * Keeps the canvas at the native framebuffer grid. SUPER-CHIP programs can
 * switch resolution mid-session, so the canvas follows the frame size.
 */
function paintFrame(
  active: ActiveSession,
  frame: GameFrame,
  canvas: HTMLCanvasElement | null
): void {
  if (!canvas) return;
  if (canvas.width !== frame.cols || canvas.height !== frame.rows) {
    canvas.width = frame.cols;
    canvas.height = frame.rows;
    active.image = null;
    active.context = null;
  }
  if (!frame.dirty) return;
  if (!active.context || !active.image) {
    const context = canvas.getContext("2d");
    if (!context) return;
    active.context = context;
    active.image = context.createImageData(frame.cols, frame.rows);
  }
  expandFrame(frame, active.image.data, PALETTE.on, PALETTE.off);
  active.context.putImageData(active.image, 0, 0);
}

export function useGameSession(options: GameSessionOptions): GameSessionHandle {
  const [runtime, setRuntime] = useState<GameSessionRuntime>(IDLE_RUNTIME);
  const [telemetry, setTelemetry] = useState<GameTelemetry>(IDLE_TELEMETRY);
  const activeRef = useRef<ActiveSession | null>(null);
  const mountedRef = useRef(true);
  const canvasTarget = useRef(options.canvas);
  const mutedRef = useRef(options.muted);

  useEffect(() => {
    canvasTarget.current = options.canvas;
    mutedRef.current = options.muted;
  }, [options.canvas, options.muted]);

  const release = useCallback((active: ActiveSession) => {
    if (activeRef.current === active) activeRef.current = null;
    active.loop.cancel();
    active.releaseKeypad();
    active.audio.dispose();
    attempt(gameApi.stop(active.session)).then(([, error]) => {
      if (error) reportBackgroundError("game.stop", error);
    });
  }, []);

  const fail = useCallback(
    (message: string) => {
      const active = activeRef.current;
      if (active) release(active);
      setRuntime({ status: "error", info: null, error: message });
      setTelemetry(IDLE_TELEMETRY);
    },
    [release]
  );

  const pump = useCallback(
    (active: ActiveSession, now: number) => {
      if (active.inFlight || activeRef.current !== active) return;
      if (!active.primed) {
        active.primed = true;
        active.lastStamp = now;
        active.telemetryStamp = now;
        return;
      }
      const elapsed = Math.min(now - active.lastStamp, GAME_DISPLAY.maxElapsedMs);
      active.lastStamp = now;
      // Displays above 60 Hz hand out raf frames shorter than one timer tick;
      // carry the fractions instead of flooring them away every frame.
      active.cycleCarry += (elapsed * active.cyclesPerSecond) / 1000;
      const cycles = Math.floor(active.cycleCarry);
      active.cycleCarry -= cycles;
      active.timerCarryMs += elapsed;
      const timerTicks = Math.floor(active.timerCarryMs / GAME_DISPLAY.frameTickMs);
      const timers = Math.min(timerTicks, GAME_DISPLAY.maxTimerTicksPerTick);
      active.timerCarryMs = Math.max(
        0,
        active.timerCarryMs - timerTicks * GAME_DISPLAY.frameTickMs
      );
      if (cycles <= 0 && timers <= 0) return;
      active.inFlight = true;
      active.frames += 1;
      attempt(gameApi.tick(active.session, cycles, timers)).then(([buffer, error]) => {
        active.inFlight = false;
        if (activeRef.current !== active) return;
        if (error) {
          fail(error.message);
          return;
        }
        const [frame, decodeError] = attemptSync(() => decodeGameFrame(buffer));
        if (decodeError) {
          fail(decodeError.message);
          return;
        }
        const canvas = canvasTarget.current.current;
        const [, paintError] = attemptSync(() => paintFrame(active, frame, canvas));
        if (paintError) {
          fail(paintError.message);
          return;
        }
        active.audio.setActive(frame.sound && !mutedRef.current);
        const since = now - active.telemetryStamp;
        if (since >= GAME_DISPLAY.telemetryIntervalMs) {
          const fps = Math.round((active.frames * 1000) / since);
          active.frames = 0;
          active.telemetryStamp = now;
          setTelemetry({
            fps,
            hires: frame.hires,
            waitingKey: frame.waitingKey,
            halted: frame.halted,
          });
        }
      });
    },
    [fail]
  );

  const start = useCallback(
    async (rom: GameRomInfo) => {
      const previous = activeRef.current;
      if (previous) release(previous);
      setRuntime({ status: "starting", info: null, error: null });
      setTelemetry(IDLE_TELEMETRY);
      const [info, error] = await attempt(gameApi.start(rom.id));
      if (error) {
        fail(error.message);
        return;
      }
      if (!mountedRef.current) {
        attempt(gameApi.stop(info.session)).then(([, stopError]) => {
          if (stopError) reportBackgroundError("game.stop", stopError);
        });
        return;
      }
      const canvas = canvasTarget.current.current;
      if (canvas) {
        canvas.width = info.cols;
        canvas.height = info.rows;
      }
      const active: ActiveSession = {
        session: info.session,
        cyclesPerSecond: info.cyclesPerSecond,
        audio: createGameAudio(),
        loop: { cancel: () => undefined },
        releaseKeypad: () => undefined,
        primed: false,
        lastStamp: 0,
        telemetryStamp: 0,
        inFlight: false,
        frames: 0,
        cycleCarry: 0,
        timerCarryMs: 0,
        image: null,
        context: null,
      };
      active.releaseKeypad = subscribeKeypad(window, {
        keys: GAME_KEY_BY_CODE,
        onKey: (key, pressed) => {
          if (activeRef.current !== active) return;
          attempt(gameApi.key(active.session, key, pressed)).then(([, keyError]) => {
            if (keyError) reportBackgroundError("game.key", keyError);
          });
        },
      });
      active.loop = createAnimationLoop((now) => pump(active, now));
      activeRef.current = active;
      setRuntime({ status: "running", info, error: null });
    },
    [fail, pump, release]
  );

  const stop = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    release(active);
    setRuntime(IDLE_RUNTIME);
    setTelemetry(IDLE_TELEMETRY);
  }, [release]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const active = activeRef.current;
      if (active) release(active);
    };
  }, [release]);

  return { runtime, telemetry, start, stop };
}
