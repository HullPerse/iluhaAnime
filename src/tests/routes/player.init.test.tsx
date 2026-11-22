import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockInvoke as invokeMock,
  mockListen as listenMock,
  mockDialogOpen,
  mockSetAlwaysOnTop,
  mockStartDragging,
} from "@/tests/mocks";

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
    setAlwaysOnTop: mockSetAlwaysOnTop,
    startDragging: mockStartDragging,
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockDialogOpen,
}));

import PlayerComponent from "@/routes/components/player/player.component";
import { notificationAtoms } from "@/store/notification.store";
import { DEFAULT_PLAYER_SETTINGS, patchPlayerSettings, playbackAtoms, resetPlayback } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => undefined);
  mockDialogOpen.mockResolvedValue(null);
  patchSettings({ language: "ru" });
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

describe("player session initialization", () => {
  it("locks playback controls and keyboard transport until the file is ready", async () => {
    resetPlayback();
    playbackAtoms.hasFile.set(true);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={queryClient}><PlayerComponent /></QueryClientProvider>);
    await act(async () => {});
    const controls = container.querySelector<HTMLFieldSetElement>("[data-player-controls]");
    expect(controls?.disabled).toBe(true);
    expect(controls?.hasAttribute("inert")).toBe(true);
    invokeMock.mockClear();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true })); });
    expect(invokeMock.mock.calls.some(([command]) => command === "player_set_property" || command === "player_command")).toBe(false);
    resetPlayback();
  });

  it("creates the mpv instance once when StrictMode mounts the effect twice", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <PlayerComponent />
        </QueryClientProvider>
      </StrictMode>
    );
    await act(async () => {});

    const initCalls = invokeMock.mock.calls.filter(([command]) => command === "player_init");
    expect(initCalls).toHaveLength(1);
  });
});
