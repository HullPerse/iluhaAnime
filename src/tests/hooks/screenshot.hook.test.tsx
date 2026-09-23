import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useScreenshot } from "@/hooks/screenshot.hook";
import { useNotificationStore } from "@/store/notification.store";
import { useOverlayStore } from "@/store/overlay.store";
import { useSettingsStore } from "@/store/settings.store";
import type { ScreenshotCapture } from "@/types/screenshot";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const CAPTURE: ScreenshotCapture = {
  path: "C:/Temp/iluha_screenshot_1.png",
  width: 1280,
  height: 720,
  defaultDir: "D:/Shots",
};

function press(partial: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      code: "KeyP",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...partial,
    })
  );
}

function serveCapture(data: ScreenshotCapture = CAPTURE) {
  mockInvoke.mockImplementation((command: string) => {
    if (command === "capture_screenshot") return Promise.resolve(data);
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  mockInvoke.mockReset();
  useNotificationStore.setState({ items: [], unreadCount: 0 });
  useOverlayStore.setState({ entries: [] });
  useSettingsStore.setState({ language: "ru" });
});

describe("useScreenshot", () => {
  it("captures the page on ctrl shift P and exposes the result", async () => {
    serveCapture();
    const { result } = renderHook(() => useScreenshot());
    expect(result.current.capture).toBeNull();

    await act(async () => {
      press();
    });

    await waitFor(() => expect(result.current.capture).toEqual(CAPTURE));
    expect(mockInvoke).toHaveBeenCalledWith("capture_screenshot", undefined);
  });

  it("ignores other chords", async () => {
    serveCapture();
    const { result } = renderHook(() => useScreenshot());

    await act(async () => {
      press({ shiftKey: false });
      press({ code: "KeyO" });
      press({ altKey: true });
      press({ metaKey: true });
    });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.capture).toBeNull();
  });

  it("captures the page even while another overlay is open", async () => {
    serveCapture();
    const unregister = useOverlayStore.getState().register(null);
    const { result } = renderHook(() => useScreenshot());

    await act(async () => {
      press();
    });

    await waitFor(() => expect(result.current.capture).toEqual(CAPTURE));
    expect(mockInvoke).toHaveBeenCalledWith("capture_screenshot", undefined);

    await act(async () => {
      unregister();
    });
  });

  it("captures once while the previous shot is still open", async () => {
    serveCapture();
    const { result } = renderHook(() => useScreenshot());

    await act(async () => {
      press();
    });
    await waitFor(() => expect(result.current.capture).toEqual(CAPTURE));

    await act(async () => {
      press();
    });

    expect(mockInvoke.mock.calls.filter(([name]) => name === "capture_screenshot")).toHaveLength(1);
  });

  it("reports a failed capture and keeps no shot", async () => {
    mockInvoke.mockRejectedValue(new Error("window is hidden"));
    const { result } = renderHook(() => useScreenshot());

    await act(async () => {
      press();
    });

    await waitFor(() => expect(useNotificationStore.getState().items).toHaveLength(1));
    expect(useNotificationStore.getState().items[0]?.type).toBe("error");
    expect(result.current.capture).toBeNull();
  });

  it("discards the temp file when the modal closes", async () => {
    serveCapture();
    const { result } = renderHook(() => useScreenshot());

    await act(async () => {
      press();
    });
    await waitFor(() => expect(result.current.capture).toEqual(CAPTURE));

    await act(async () => {
      result.current.close();
    });

    expect(result.current.capture).toBeNull();
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("discard_screenshot", {
        sourcePath: CAPTURE.path,
      })
    );
  });
});
