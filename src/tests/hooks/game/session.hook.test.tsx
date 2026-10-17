import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GAME_DISPLAY } from "@/config/game/display.config";
import { useGameSession } from "@/hooks/game/session.hook";
import type { GameSessionHandle } from "@/hooks/game/session.hook";
import {
  FRAME_FLAG_DIRTY,
  FRAME_FLAG_HIRES,
  FRAME_FLAG_SOUND,
  FRAME_HEADER_BYTES,
  HIGH_FRAME_BYTES,
  LOW_FRAME_BYTES,
  parseHexColor,
} from "@/lib/game/frame.utils";
import type { GameRomInfo, GameStartInfo } from "@/types/game";

import { mockInvoke } from "../../mocks";

const audio = vi.hoisted(() => ({ setActive: vi.fn(), dispose: vi.fn() }));

vi.mock("@/lib/game/audio.utils", () => ({ createGameAudio: () => audio }));

const ROM: GameRomInfo = {
  id: "rom:test-1",
  name: "Test ROM",
  platform: "chip8",
  source: "user",
  author: null,
  license: null,
  size: 512,
};

const START: GameStartInfo = {
  session: 7,
  id: ROM.id,
  name: ROM.name,
  platform: "chip8",
  author: ROM.author,
  license: ROM.license,
  howto: "Keys 1-4 steer the test ROM.",
  cols: 64,
  rows: 32,
  cyclesPerSecond: 720,
};

const ON = parseHexColor(GAME_DISPLAY.pixel);
const OFF = parseHexColor(GAME_DISPLAY.background);

let frames: FrameRequestCallback[] = [];
let clock = 0;
let putImageData: ReturnType<typeof vi.fn>;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

function tickResponse(flags: number, pixels: number[] = [], hires = false): ArrayBuffer {
  const bytes = new Uint8Array(FRAME_HEADER_BYTES + (hires ? HIGH_FRAME_BYTES : LOW_FRAME_BYTES));
  bytes[0] = flags;
  bytes.set(pixels, FRAME_HEADER_BYTES);
  return bytes.buffer;
}

function step(deltaMs: number): void {
  clock += deltaMs;
  const pending = frames;
  frames = [];
  for (const scheduled of pending) scheduled(clock);
}

function startMock(tick: () => ArrayBuffer | Promise<ArrayBuffer>): void {
  mockInvoke.mockImplementation(async (command: unknown) => {
    if (command === "game_start") return START;
    if (command === "game_tick") return await tick();
    return null;
  });
}

function tickCalls(): number {
  return mockInvoke.mock.calls.filter(([command]) => command === "game_tick").length;
}

function renderSession(muted = false) {
  const canvas = document.createElement("canvas");
  const ref = { current: canvas };
  const view = renderHook(
    ({ muted: current }) => useGameSession({ canvas: ref, muted: current }),
    { initialProps: { muted } }
  );
  return { canvas, ...view };
}

async function start(view: { result: { current: GameSessionHandle } }): Promise<void> {
  await act(async () => {
    await view.result.current.start(ROM);
  });
}

beforeEach(() => {
  frames = [];
  clock = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  putImageData = vi.fn();
  const context = {
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    putImageData,
  };
  HTMLCanvasElement.prototype.getContext = (() =>
    context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useGameSession", () => {
  it("starts the ROM, primes the clock on the first frame and paints dirty frames", async () => {
    startMock(() => tickResponse(FRAME_FLAG_DIRTY, [0x80]));
    const { result, canvas } = renderSession();
    await start({ result });

    expect(mockInvoke).toHaveBeenCalledWith("game_start", { id: ROM.id });
    expect(result.current.runtime).toMatchObject({ status: "running", info: { session: 7 } });
    expect(result.current.runtime.info?.howto).toBe("Keys 1-4 steer the test ROM.");
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(32);

    act(() => step(0));
    expect(tickCalls()).toBe(0);

    await act(async () => step(16.6667));
    expect(mockInvoke).toHaveBeenCalledWith("game_tick", { cycles: 12, session: 7, timers: 1 });
    await waitFor(() => expect(putImageData).toHaveBeenCalledTimes(1));

    const image = putImageData.mock.calls.at(-1)?.[0] as ImageData;
    expect(image.data[0]).toBe(ON[0]);
    expect(image.data[4]).toBe(OFF[0]);

    act(() => result.current.stop());
  });

  it("skips clean frames but follows resolution switches", async () => {
    let hires = false;
    startMock(() => tickResponse(FRAME_FLAG_DIRTY | (hires ? FRAME_FLAG_HIRES : 0), [], hires));
    const { result, canvas } = renderSession();
    await start({ result });

    act(() => step(0));
    await act(async () => step(16.6667));
    await waitFor(() => expect(canvas.width).toBe(64));

    hires = true;
    await act(async () => step(16.6667));
    await waitFor(() => expect(canvas.width).toBe(128));
    expect(canvas.height).toBe(64);

    act(() => result.current.stop());
  });

  it("publishes fps and flags telemetry about twice per second", async () => {
    startMock(() => tickResponse(FRAME_FLAG_DIRTY | FRAME_FLAG_HIRES, [], true));
    const { result } = renderSession();
    await start({ result });

    for (let index = 0; index < 33; index += 1) {
      await act(async () => step(16.6667));
    }

    await waitFor(() => expect(result.current.telemetry.fps).toBeGreaterThan(0));
    expect(result.current.telemetry.hires).toBe(true);

    act(() => result.current.stop());
  });

  it("carries fractional time so timer ticks survive raf frames above 60 Hz", async () => {
    startMock(() => tickResponse(0));
    const { result } = renderSession();
    await start({ result });

    act(() => step(0));
    for (let index = 0; index < 30; index += 1) {
      await act(async () => step(5.556));
    }

    const ticks = mockInvoke.mock.calls
      .filter(([command]) => command === "game_tick")
      .map(([, callArgs]) => callArgs as { cycles: number; timers: number });
    expect(ticks.reduce((total, callArgs) => total + callArgs.timers, 0)).toBe(10);
    expect(ticks.reduce((total, callArgs) => total + callArgs.cycles, 0)).toBe(120);

    act(() => result.current.stop());
  });

  it("forwards keypad presses and releases through game_key", async () => {
    startMock(() => tickResponse(0));
    const { result } = renderSession();
    await start({ result });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyX" }));
    });
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("game_key", { key: 0, pressed: true, session: 7 })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, code: "KeyX" }));
    });
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("game_key", { key: 0, pressed: false, session: 7 })
    );

    act(() => result.current.stop());
  });

  it("stops the backend session and the animation loop", async () => {
    startMock(() => tickResponse(0));
    const { result } = renderSession();
    await start({ result });

    act(() => step(0));
    await act(async () => step(16.6667));
    const before = tickCalls();
    expect(before).toBeGreaterThan(0);

    await act(async () => result.current.stop());

    expect(mockInvoke).toHaveBeenCalledWith("game_stop", { session: 7 });
    expect(audio.dispose).toHaveBeenCalled();
    expect(result.current.runtime.status).toBe("idle");

    await act(async () => step(16.6667));
    expect(tickCalls()).toBe(before);
  });

  it("surfaces tick failures as an error and tears the session down", async () => {
    mockInvoke.mockImplementation(async (command: unknown) => {
      if (command === "game_start") return START;
      if (command === "game_tick") throw new Error("no active game session");
      return null;
    });
    const { result } = renderSession();
    await start({ result });

    act(() => step(0));
    await act(async () => step(16.6667));

    await waitFor(() => expect(result.current.runtime.status).toBe("error"));
    expect(result.current.runtime.error).toBe("no active game session");
    expect(mockInvoke).toHaveBeenCalledWith("game_stop", { session: 7 });
    expect(audio.dispose).toHaveBeenCalled();
  });

  it("follows the sound flag and the mute toggle", async () => {
    startMock(() => tickResponse(FRAME_FLAG_DIRTY | FRAME_FLAG_SOUND));
    const { result, rerender } = renderSession(true);
    await start({ result });

    act(() => step(0));
    await act(async () => step(16.6667));
    await waitFor(() => expect(audio.setActive).toHaveBeenCalledWith(false));

    rerender({ muted: false });
    await act(async () => step(16.6667));
    await waitFor(() => expect(audio.setActive).toHaveBeenLastCalledWith(true));

    act(() => result.current.stop());
  });

  it("releases the backend session on unmount", async () => {
    startMock(() => tickResponse(0));
    const { result, unmount } = renderSession();
    await start({ result });

    unmount();

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("game_stop", { session: 7 }));
    expect(audio.dispose).toHaveBeenCalled();
  });
});
