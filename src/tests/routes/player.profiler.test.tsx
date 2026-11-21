import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockInvoke as invokeMock,
  mockListen as listenMock,
  mockDialogOpen,
  mockSetAlwaysOnTop,
  mockStartDragging,
} from "@/tests/mocks";

const headerProbe = vi.hoisted(() => ({ renders: 0 }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => Promise.resolve(false),
    setFullscreen: () => Promise.resolve(undefined),
    setAlwaysOnTop: mockSetAlwaysOnTop,
    startDragging: mockStartDragging,
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockDialogOpen }));

// This probe is deliberately not memoized: if PlayerComponent re-renders, the
// header re-renders and the count grows.
vi.mock("@/routes/components/player/media/header.player", () => ({
  default: () => {
    headerProbe.renders += 1;
    return null;
  },
}));

import PlayerComponent from "@/routes/components/player/player.component";
import { notificationAtoms } from "@/store/notification.store";
import {
  DEFAULT_PLAYER_SETTINGS,
  patchPlayerSettings,
  playbackAtoms,
  resetPlayback,
} from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  headerProbe.renders = 0;
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => undefined);
  mockDialogOpen.mockResolvedValue(null);
  patchSettings({ language: "ru" });
  patchPlayerSettings({ ...DEFAULT_PLAYER_SETTINGS });
  resetPlayback();
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

describe("player shell profiler", () => {
  it("keeps the shell out of the timePos update path", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const samples: { phase: string; actualDuration: number }[] = [];

    render(
      <QueryClientProvider client={client}>
        <Profiler
          id="player-shell"
          onRender={(_id, phase, actualDuration) => {
            samples.push({ phase, actualDuration });
          }}
        >
          <PlayerComponent />
        </Profiler>
      </QueryClientProvider>
    );
    await act(async () => {});

    const mountedHeaderRenders = headerProbe.renders;
    expect(mountedHeaderRenders).toBeGreaterThan(0);
    const mountedSamples = samples.length;

    for (let tick = 1; tick <= 10; tick += 1) {
      act(() => {
        playbackAtoms.timePos.set(tick * 10);
      });
    }

    const updates = samples.slice(mountedSamples).filter((sample) => sample.phase !== "mount");
    const totalActualDuration = updates.reduce((sum, sample) => sum + sample.actualDuration, 0);
    const maxActualDuration = updates.reduce(
      (max, sample) => Math.max(max, sample.actualDuration),
      0
    );
    console.warn(
      `[profiler] player shell: header renders=${mountedHeaderRenders}, update commits=${updates.length}, total actualDuration=${totalActualDuration.toFixed(2)}ms, max=${maxActualDuration.toFixed(2)}ms`
    );

    expect(headerProbe.renders).toBe(mountedHeaderRenders);
    expect(updates.length).toBe(10);
  });
});
