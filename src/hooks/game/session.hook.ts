import { useCallback, useEffect, useRef, useState } from "react";

import { gameApi } from "@/api/game.api";
import { GAME_DISPLAY } from "@/config/player/display.config";
import { GAME_KEY_BY_CODE } from "@/config/settings/keypad.config";
import { createGameAudio } from "@/lib/player/audio.utils";
import type { GameAudio } from "@/types/player/audio";
import { decodeGameFrame, expandFrame, tryParseHexColor } from "@/lib/core/frame.utils";
import type { Rgba } from "@/types/core/frame";
import { subscribeKeypad } from "@/lib/core/keypadHotkeys.utils";
import { createAnimationLoop } from "@/lib/core/interval.utils";
import type { AnimationLoopTask } from "@/types/core/interval";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";
import type { GameFrame, GamePalette, GameRomInfo, GameTelemetry } from "@/types/core/game";
import type {
  GameSessionHandle,
  GameSessionOptions,
  GameSessionRuntime,
} from "@/types/core/gameSession";

const PALETTE = {
  on: tryParseHexColor(GAME_DISPLAY.pixel, [255, 255, 255, 255]),
  off: tryParseHexColor(GAME_DISPLAY.background, [0, 0, 0, 255]),
} as const;

/** One-bit frames keep the theme; XO frames index four colours (0-3). */
const THEME_COLORS: readonly Rgba[] = [PALETTE.off, PALETTE.on];

const XO_FILL2_FALLBACK: Rgba = [255, 102, 0, 255];
const XO_BLEND_FALLBACK: Rgba = [102, 34, 0, 255];

/** Background, first plane, second plane and overlap for a session. */
function sessionColors(palette: GamePalette | null): readonly Rgba[] {
  if (palette === null) return THEME_COLORS;
  return [
    tryParseHexColor(palette.background, THEME_COLORS[0]),
    tryParseHexColor(palette.fill, THEME_COLORS[1]),
    tryParseHexColor(palette.fill2, XO_FILL2_FALLBACK),
    tryParseHexColor(palette.blend, XO_BLEND_FALLBACK),
  ];
}

const IDLE_RUNTIME: GameSessionRuntime = { status: "idle", info: null, error: null };
const IDLE_TELEMETRY: GameTelemetry = { fps: 0, hires: false, waitingKey: false, halted: false };
const NO_KEYS: ReadonlySet<number> = new Set();

interface ActiveSession {
  session: number;
  cyclesPerSecond: number;
  audio: GameAudio;
  /** Palette of the packed frames: two theme colours or the four XO ones. */
  colors: readonly Rgba[];
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
  expandFrame(frame, active.image.data, active.colors);
  active.context.putImageData(active.image, 0, 0);
}

export function useGameSession(options: GameSessionOptions): GameSessionHandle {
  const [runtime, setRuntime] = useState<GameSessionRuntime>(IDLE_RUNTIME);
  const [telemetry, setTelemetry] = useState<GameTelemetry>(IDLE_TELEMETRY);
  const [pressedKeys, setPressedKeys] = useState<ReadonlySet<number>>(NO_KEYS);
  const activeRef = useRef<ActiveSession | null>(null);
  const mountedRef = useRef<boolean>(true);
  const canvasTarget = useRef<GameSessionOptions["canvas"]>(options.canvas);
  const mutedRef = useRef<GameSessionOptions["muted"]>(options.muted);
  const volumeRef = useRef<GameSessionOptions["volume"]>(options.volume);

  useEffect(() => {
    canvasTarget.current = options.canvas;
    mutedRef.current = options.muted;
    volumeRef.current = options.volume;
    activeRef.current?.audio.setVolume(options.volume);
  }, [options.canvas, options.muted, options.volume]);

  /** Single key path: physical presses and keypad clicks both land here. */
  const sendKey = useCallback((active: ActiveSession, key: number, pressed: boolean) => {
    setPressedKeys((current) => {
      if (pressed === current.has(key)) return current;
      const next = new Set(current);
      if (pressed) next.add(key);
      else next.delete(key);
      return next;
    });
    attempt(gameApi.key(active.session, key, pressed))
      .then(([, keyError]) => {
        if (keyError) reportBackgroundError("game.key", keyError);
        return null;
      })
      .catch((error: unknown) => reportBackgroundError("srchooksgamesession", error));
  }, []);

  const release = useCallback((active: ActiveSession) => {
    if (activeRef.current === active) activeRef.current = null;
    active.loop.cancel();
    active.releaseKeypad();
    active.audio.dispose();
    setPressedKeys(NO_KEYS);
    attempt(gameApi.stop(active.session))
      .then(([, error]) => {
        if (error) reportBackgroundError("game.stop", error);
        return null;
      })
      .catch((error: unknown) => reportBackgroundError("srchooksgamesession", error));
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
      attempt(gameApi.tick(active.session, cycles, timers))
        .then(([buffer, error]) => {
          active.inFlight = false;
          if (activeRef.current !== active) return null;
          if (error) {
            fail(error.message);
            return null;
          }
          const [frame, decodeError] = attemptSync(() => decodeGameFrame(buffer));
          if (decodeError) {
            fail(decodeError.message);
            return null;
          }
          const canvas = canvasTarget.current.current;
          const [, paintError] = attemptSync(() => paintFrame(active, frame, canvas));
          if (paintError) {
            fail(paintError.message);
            return null;
          }
          if (frame.audio) {
            active.audio.setWavetable(frame.audio.pitchHz, frame.audio.pattern);
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
          return null;
        })
        .catch((error: unknown) => reportBackgroundError("srchooksgamesession", error));
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
        attempt(gameApi.stop(info.session))
          .then(([, stopError]) => {
            if (stopError) reportBackgroundError("game.stop", stopError);
            return null;
          })
          .catch((error: unknown) => reportBackgroundError("srchooksgamesession", error));
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
        audio: createGameAudio(info.palette === null ? "beep" : "wavetable"),
        colors: sessionColors(info.palette),
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
          sendKey(active, key, pressed);
        },
      });
      active.audio.setVolume(volumeRef.current);
      active.loop = createAnimationLoop((now) => pump(active, now));
      activeRef.current = active;
      setRuntime({ status: "running", info, error: null });
    },
    [fail, pump, release, sendKey]
  );

  const stop = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    release(active);
    setRuntime(IDLE_RUNTIME);
    setTelemetry(IDLE_TELEMETRY);
  }, [release]);

  const pressKey = useCallback(
    (key: number, pressed: boolean) => {
      const active = activeRef.current;
      if (!active) return;
      sendKey(active, key, pressed);
    },
    [sendKey]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const active = activeRef.current;
      if (active) release(active);
    };
  }, [release]);

  return { runtime, telemetry, pressedKeys, start, stop, pressKey };
}
