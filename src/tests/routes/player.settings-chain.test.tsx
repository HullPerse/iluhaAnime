import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => Promise.resolve(false),
    setFullscreen: () => Promise.resolve(undefined),
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: () => Promise.resolve(null),
}));

import PlayerComponent from "@/routes/components/player/player.component";
import {
  DEFAULT_PLAYER_SETTINGS,
  patchPlayerSettings,
  playbackAtoms,
  setVolume,
} from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

function setPropertyCalls(name: string): unknown[] {
  return invokeMock.mock.calls
    .filter(([command]) => command === "player_set_property")
    .map(([, args]) => args)
    .filter((args) => (args as { name?: string }).name === name)
    .map((args) => (args as { value?: unknown }).value);
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => undefined);
  patchSettings({ language: "en" });
  patchPlayerSettings({ ...DEFAULT_PLAYER_SETTINGS });
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mountPlayer(): Promise<void> {
  render(<PlayerComponent />);
  await act(async () => {});
}

describe("player settings chain store -> debounce -> mpv", () => {
  it("delivers volume to mpv immediately without debounce", async () => {
    await mountPlayer();
    act(() => {
      setVolume(0.9);
    });
    await act(async () => {});
    expect(setPropertyCalls("volume")).toEqual([90]);
  });

  it("delivers rotation to mpv after the settings debounce", async () => {
    await mountPlayer();
    expect(setPropertyCalls("video-rotate")).toEqual([]);

    act(() => {
      patchPlayerSettings({ rotation: 90 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(setPropertyCalls("video-rotate")).toEqual([90]);
  });

  it("delivers brightness mapped onto the mpv scale", async () => {
    await mountPlayer();
    act(() => {
      patchPlayerSettings({ brightness: 150 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(setPropertyCalls("brightness")).toEqual([50]);
  });

  it("coalesces rapid slider changes into one mpv write", async () => {
    await mountPlayer();
    act(() => {
      patchPlayerSettings({ rotation: 10 });
      patchPlayerSettings({ rotation: 20 });
      patchPlayerSettings({ rotation: 30 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(setPropertyCalls("video-rotate")).toEqual([30]);
  });

  it("throttles rapid volume changes with a trailing exact value", async () => {
    await mountPlayer();
    invokeMock.mockClear();
    act(() => {
      setVolume(0.5);
    });
    await act(async () => {});
    expect(setPropertyCalls("volume")).toEqual([50]);
    act(() => {
      setVolume(0.6);
      setVolume(0.7);
    });
    await act(async () => {});
    expect(setPropertyCalls("volume")).toEqual([50]);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(setPropertyCalls("volume")).toEqual([50, 70]);
  });

  it("skips watch saves when the position is unchanged", async () => {
    await mountPlayer();
    invokeMock.mockClear();
    const saves = (): number =>
      invokeMock.mock.calls.filter(([command]) => command === "player_save_watch").length;
    act(() => {
      playbackAtoms.path.set("/a.mkv");
      playbackAtoms.duration.set(1400);
      playbackAtoms.paused.set(false);
      playbackAtoms.eofReached.set(false);
      playbackAtoms.timePos.set(42);
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(saves()).toBe(1);
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(saves()).toBe(1);
    act(() => {
      playbackAtoms.timePos.set(43);
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(saves()).toBe(2);
  });
});
