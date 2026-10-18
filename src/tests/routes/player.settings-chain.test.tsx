import { mockInvoke as invokeMock, mockListen as listenMock, mockDialogOpen } from "../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";


vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => Promise.resolve(false),
    setFullscreen: () => Promise.resolve(undefined),
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockDialogOpen,
}));

import PlayerComponent from "@/routes/components/player/player.component";
import { notificationAtoms } from "@/store/notification.store";
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
  mockDialogOpen.mockResolvedValue(null);
  patchSettings({ language: "en" });
  patchPlayerSettings({ ...DEFAULT_PLAYER_SETTINGS });
  notificationAtoms.items.set([]);
  notificationAtoms.unreadCount.set(0);
  notificationAtoms.dismissed.set([]);
  vi.useFakeTimers();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mountPlayer(): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PlayerComponent />
    </QueryClientProvider>
  );
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

  it("delivers hue to mpv after the settings debounce", async () => {
    await mountPlayer();
    expect(setPropertyCalls("hue")).toEqual([]);

    act(() => {
      patchPlayerSettings({ hue: 90 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(setPropertyCalls("hue")).toEqual([90]);
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
      patchPlayerSettings({ contrast: 110 });
      patchPlayerSettings({ contrast: 120 });
      patchPlayerSettings({ contrast: 130 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(setPropertyCalls("contrast")).toEqual([30]);
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

describe("player settings rejections reach the user", () => {
  const rejectBrightness = async (command: string, args?: Record<string, unknown>) => {
    if (command === "player_set_property" && args?.name === "brightness") {
      throw new Error("Failed to set property 'brightness': error accessing property");
    }
    return undefined;
  };

  it("notifies once per rejected property and re-arms it after a clean apply", async () => {
    await mountPlayer();
    invokeMock.mockImplementation(rejectBrightness);

    act(() => {
      patchPlayerSettings({ brightness: 120 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {});

    expect(notificationAtoms.items.get()).toHaveLength(1);
    expect(notificationAtoms.items.get()[0].type).toBe("error");
    expect(notificationAtoms.items.get()[0].message).toContain("brightness");
    const firstTimestamp = notificationAtoms.items.get()[0].timestamp;

    // a repeat of the same rejected value stays quiet, which the store would otherwise fold in
    // by bumping the notice timestamp
    vi.setSystemTime(firstTimestamp + 5_000);
    act(() => {
      patchPlayerSettings({ brightness: 130 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {});

    expect(notificationAtoms.items.get()).toHaveLength(1);
    expect(notificationAtoms.items.get()[0].timestamp).toBe(firstTimestamp);

    invokeMock.mockResolvedValue(undefined);
    act(() => {
      patchPlayerSettings({ brightness: 140 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {});

    expect(notificationAtoms.items.get()).toHaveLength(1);

    vi.setSystemTime(firstTimestamp + 30_000);
    invokeMock.mockImplementation(rejectBrightness);
    act(() => {
      patchPlayerSettings({ brightness: 150 });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {});

    expect(notificationAtoms.items.get()).toHaveLength(2);
    expect(notificationAtoms.items.get()[0].message).toContain("brightness");
  });
});
