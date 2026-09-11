import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WallpaperCanvas from "@/routes/components/search/modern/wallpaper.canvas";
import { useSettingsStore } from "@/store/settings.store";

class ControlledImage {
  static instances: ControlledImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  naturalWidth = 640;
  naturalHeight = 480;
  #src = "";
  constructor() {
    ControlledImage.instances.push(this);
  }
  get src(): string {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
  }
}

function lastImage(): ControlledImage {
  const current = ControlledImage.instances.at(-1);
  if (!current) throw new Error("no image instance");
  return current;
}

function canvas(): HTMLCanvasElement | null {
  return document.querySelector('canvas[aria-label="wallpaper"]');
}

beforeEach(() => {
  ControlledImage.instances = [];
  vi.stubGlobal("Image", ControlledImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WallpaperCanvas", () => {
  it("paints the loaded image and exposes it via data-src", async () => {
    render(<WallpaperCanvas src="a.png" alt="wallpaper" />);
    await act(async () => {
      lastImage().onload?.();
    });
    await waitFor(() => expect(canvas()?.dataset.src).toBe("a.png"));
  });

  it("ignores a stale load after the source changes", async () => {
    const { rerender } = render(<WallpaperCanvas src="a.png" alt="wallpaper" />);
    const first = lastImage();
    rerender(<WallpaperCanvas src="b.png" alt="wallpaper" />);
    const second = lastImage();
    expect(second).not.toBe(first);
    await act(async () => {
      first.onload?.();
    });
    await act(async () => {
      second.onload?.();
    });
    await waitFor(() => expect(canvas()?.dataset.src).toBe("b.png"));
  });

  it("falls back after repeated load errors", async () => {
    render(<WallpaperCanvas src="gone.png" alt="wallpaper" />);
    await act(async () => {
      lastImage().onerror?.();
    });
    await act(async () => {
      lastImage().onerror?.();
    });
    await act(async () => {
      lastImage().onerror?.();
    });
    await waitFor(() => expect(document.querySelector("canvas")).toBeNull());
    expect(screen.getByRole("img")).toBeTruthy();
  });

  it("ignores mouse movement", async () => {
    render(<WallpaperCanvas src="a.png" alt="wallpaper" />);
    await act(async () => {
      lastImage().onload?.();
    });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 0 });
    await waitFor(() => expect(canvas()?.dataset.src).toBe("a.png"));
    expect(canvas()?.style.transform).toBe("");
  });
});
