import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockInvoke as invokeMock,
  mockListen as listenMock,
  mockDialogOpen,
  mockSetAlwaysOnTop,
  mockStartDragging,
} from "../mocks";

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
import {
  DEFAULT_PLAYER_SETTINGS,
  patchPlayerSettings,
  playerAtoms,
  resetPlayback,
  setAlwaysOnTop,
  setAutoHide,
} from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";

function pressKey(code: string, options: { ctrlKey?: boolean } = {}): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code,
      ctrlKey: options.ctrlKey ?? false,
    })
  );
}

function headerVisible(): boolean {
  return screen.queryByRole("button", { name: "Settings" }) !== null;
}

function fullBarVisible(): boolean {
  return screen.queryByRole("button", { name: "Previous file" }) !== null;
}

function slimBarVisible(): boolean {
  return screen.queryAllByRole("button", { name: "Play / pause" }).length === 1;
}

function slimBarHidden(): boolean {
  const button = screen.queryByRole("button", { name: "Play / pause" });
  if (!button) return true;
  return button.closest(".transition-opacity")?.classList.contains("opacity-0") ?? false;
}

function video(): Element {
  const node = document.querySelector("[data-player-video]");
  if (!node) throw new Error("video container missing");
  return node;
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => undefined);
  mockDialogOpen.mockResolvedValue(null);
  mockSetAlwaysOnTop.mockReset();
  mockSetAlwaysOnTop.mockResolvedValue(undefined);
  mockStartDragging.mockReset();
  mockStartDragging.mockResolvedValue(undefined);
  patchSettings({ language: "en" });
  patchPlayerSettings({ ...DEFAULT_PLAYER_SETTINGS });
  setAlwaysOnTop(false);
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

async function mountPlayer(): Promise<void> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PlayerComponent />
    </QueryClientProvider>
  );
  await act(async () => {});
}

describe("player view modes", () => {
  it("starts in the normal preset with the full chrome", async () => {
    await mountPlayer();
    expect(headerVisible()).toBe(true);
    expect(fullBarVisible()).toBe(true);
    expect(slimBarVisible()).toBe(false);
  });

  it("keeps the slim bar on 1 and auto-hides it", async () => {
    await mountPlayer();
    act(() => {
      pressKey("Digit1");
    });
    expect(headerVisible()).toBe(false);
    expect(fullBarVisible()).toBe(false);
    expect(slimBarVisible()).toBe(true);
    expect(slimBarHidden()).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(slimBarHidden()).toBe(true);

    await act(async () => {
      fireEvent.mouseMove(window);
    });
    expect(slimBarHidden()).toBe(false);

    expect(video()).toBeTruthy();
  });

  it("gives the slim bar on 2 and keeps it visible", async () => {
    await mountPlayer();
    act(() => {
      pressKey("Digit2");
    });
    expect(headerVisible()).toBe(false);
    expect(fullBarVisible()).toBe(false);
    expect(slimBarVisible()).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(slimBarHidden()).toBe(false);
  });

  it("keeps the compact bar visible even with the auto-hide setting on", async () => {
    setAutoHide(true);
    await mountPlayer();
    act(() => {
      pressKey("Digit2");
    });
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(slimBarVisible()).toBe(true);
    expect(slimBarHidden()).toBe(false);
  });

  it("restores the windowed layout on 3", async () => {
    await mountPlayer();
    act(() => {
      pressKey("Digit1");
    });
    expect(headerVisible()).toBe(false);
    act(() => {
      pressKey("Digit3");
    });
    expect(headerVisible()).toBe(true);
    expect(fullBarVisible()).toBe(true);
  });

  it("switches cinema off when a reduced preset takes over", async () => {
    await mountPlayer();
    const cinemaButton = screen.getByRole("button", { name: "Cinema mode" });
    expect(cinemaButton.getAttribute("title")).toBe("Cinema mode");

    fireEvent.click(cinemaButton);
    expect(screen.getByRole("button", { name: "Cinema mode" }).getAttribute("title")).toBe(
      "Exit cinema mode"
    );

    act(() => {
      pressKey("Digit1");
    });
    act(() => {
      pressKey("Digit3");
    });
    expect(screen.getByRole("button", { name: "Cinema mode" }).getAttribute("title")).toBe(
      "Cinema mode"
    );
  });

  it("returns from a reduced preset to normal on escape", async () => {
    await mountPlayer();
    act(() => {
      pressKey("Digit2");
    });
    expect(headerVisible()).toBe(false);

    await act(async () => {
      pressKey("Escape");
    });
    await act(async () => {});

    expect(headerVisible()).toBe(true);
    expect(fullBarVisible()).toBe(true);
  });

  it("toggles always on top on ctrl+a and persists the flag", async () => {
    await mountPlayer();
    await act(async () => {
      pressKey("KeyA", { ctrlKey: true });
    });
    expect(playerAtoms.alwaysOnTop.get()).toBe(true);
    expect(mockSetAlwaysOnTop).toHaveBeenLastCalledWith(true);

    await act(async () => {
      pressKey("KeyA", { ctrlKey: true });
    });
    expect(playerAtoms.alwaysOnTop.get()).toBe(false);
    expect(mockSetAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });

  it("applies the stored always on top flag when the window opens", async () => {
    setAlwaysOnTop(true);
    await mountPlayer();
    expect(mockSetAlwaysOnTop).toHaveBeenCalledWith(true);
  });

  it("drags the window from the video in a preset without header", async () => {
    await mountPlayer();
    act(() => {
      pressKey("Digit1");
    });
    const node = video();
    fireEvent.mouseDown(node, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(node, { clientX: 112, clientY: 100 });
    expect(mockStartDragging).toHaveBeenCalledTimes(1);
  });

  it("keeps a plain click on the video a click, not a drag", async () => {
    await mountPlayer();
    act(() => {
      pressKey("Digit1");
    });
    const node = video();
    fireEvent.mouseDown(node, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(node, { clientX: 102, clientY: 101 });
    fireEvent.mouseUp(node, { button: 0, clientX: 102, clientY: 101 });
    expect(mockStartDragging).not.toHaveBeenCalled();
  });

  it("does not drag the window from the video while the header exists", async () => {
    await mountPlayer();
    const node = video();
    fireEvent.mouseDown(node, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(node, { clientX: 140, clientY: 100 });
    expect(mockStartDragging).not.toHaveBeenCalled();
  });
});
