import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlayerViewChrome } from "@/hooks/player/viewChrome.hook";
import { setAlwaysOnTop, setAutoHide } from "@/store/player.store";

const { mockSetFullscreen } = vi.hoisted(() => ({ mockSetFullscreen: vi.fn() }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => Promise.resolve(false),
    setFullscreen: mockSetFullscreen,
    setAlwaysOnTop: () => Promise.resolve(),
    startDragging: () => Promise.resolve(),
  }),
}));

beforeEach(() => {
  setAlwaysOnTop(false);
  mockSetFullscreen.mockReset();
  mockSetFullscreen.mockResolvedValue(undefined);
});

afterEach(() => {
  setAutoHide(false);
  vi.restoreAllMocks();
});

const mount = () =>
  renderHook(() =>
    usePlayerViewChrome({
      autoHide: false,
      menuOpen: false,
      closeOverlay: () => false,
    })
  );

describe("usePlayerViewChrome", () => {
  it("starts in the normal preset with the full chrome", () => {
    const { result } = mount();

    expect(result.current.viewMode).toBe("normal");
    expect(result.current.chrome.showHeader).toBe(true);
    expect(result.current.chrome.bottom).toBe("full");
    expect(result.current.immersive).toBe(false);
  });

  it("switches to the minimal preset and hides the header", () => {
    const { result } = mount();

    act(() => result.current.applyViewMode("minimal"));

    expect(result.current.viewMode).toBe("minimal");
    expect(result.current.chrome.showHeader).toBe(false);
    expect(result.current.chrome.bottom).toBe("slim");
    expect(result.current.immersive).toBe(true);
  });

  it("toggles cinema independently of the view preset", () => {
    const { result } = mount();

    act(() => result.current.toggleCinema());

    expect(result.current.cinema).toBe(true);
    expect(result.current.immersive).toBe(true);
    expect(result.current.chrome.showHeader).toBe(true);
  });

  it("asks the window to enter fullscreen and records it", async () => {
    const { result } = mount();

    await act(async () => {
      await result.current.toggleFullscreen();
    });

    expect(mockSetFullscreen).toHaveBeenCalledWith(true);
    expect(result.current.fullscreen).toBe(true);
    expect(result.current.immersive).toBe(true);
  });
});
