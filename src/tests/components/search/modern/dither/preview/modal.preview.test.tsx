import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type Ref } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toUserImage } from "@/lib/utils/image.utils";
import DitherPreviewModal from "@/routes/components/search/modern/dither/preview/modal.preview";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { UserImage, UserImageFile } from "@/types/image.userimage";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

let lastCanvasSrc = "";
let lastCanvasLevels = 0;
let lastCanvasScale = 0;
vi.mock("@/components/shared/dither.component", () => {
  function MockDitherCanvas({
    src,
    levels,
    scale,
    onReady,
    ref,
  }: {
    src: string;
    levels?: number;
    scale?: number;
    onReady?: () => void;
    ref?: Ref<HTMLCanvasElement>;
  }) {
    useEffect(() => {
      lastCanvasSrc = src;
      lastCanvasLevels = levels ?? 0;
      lastCanvasScale = scale ?? 0;
      onReady?.();
    }, [src, levels, scale, onReady]);
    return <canvas data-testid="preview-canvas" ref={ref} />;
  }
  return { default: MockDitherCanvas };
});
const IMAGE: UserImage = {
  id: "aaa",
  name: "first.png",
  mimeType: "image/png",
  url: "data:image/png;base64,AAAA",
  originalUrl: "data:image/png;base64,OOOO",
  ditherOptions: null,
  createdAt: 10,
};

const UPDATED_FILE: UserImageFile = {
  ...IMAGE,
  path: "C:/images/aaa.baked.png",
  originalPath: "C:/images/aaa.original.png",
};

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  naturalWidth = 4;
  naturalHeight = 1;
  _src = "";
  get src(): string {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
}

function errorMessages() {
  return useNotificationStore
    .getState()
    .items.filter((item) => item.type === "error")
    .map((item) => item.message);
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  useNotificationStore.setState({ items: [], unreadCount: 0, dismissed: [] });
  mockInvoke.mockReset();
  lastCanvasLevels = 0;
  lastCanvasScale = 0;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,BAKED");
});

describe("DitherPreviewModal", () => {
  it("renders from the pristine original with the empty preset", async () => {
    render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(lastCanvasSrc).toBe("data:image/png;base64,OOOO"));
    expect(screen.getByRole("button", { name: "Empty" })).toBeTruthy();
    expect(screen.getAllByRole("slider")).toHaveLength(22);
    expect((screen.getByRole("button", { name: "Empty" }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it("switches presets", async () => {
    const user = userEvent.setup();
    render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(lastCanvasSrc).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "Deep" }));
    expect((screen.getByRole("button", { name: "Deep" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Empty" }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it("bakes the canvas into the database and goes back", async () => {
    const user = userEvent.setup();
    const updated = toUserImage(UPDATED_FILE);
    mockInvoke.mockResolvedValue(UPDATED_FILE);
    const onBack = vi.fn();
    const onSaved = vi.fn();
    render(<DitherPreviewModal image={IMAGE} onBack={onBack} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_dither_image_data", {
        id: "aaa",
        dataUrl: "data:image/png;base64,BAKED",
      })
    );
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("notifies when baking fails and stays open", async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValue(new Error("db locked"));
    const onBack = vi.fn();
    const onSaved = vi.fn();
    render(<DitherPreviewModal image={IMAGE} onBack={onBack} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(errorMessages()).toContain("Could not save the edited image."));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("switches the threshold matrix", async () => {
    const user = userEvent.setup();
    render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
    const bayer = screen.getByRole("button", { name: "Bayer 4" });
    const blue = screen.getByRole("button", { name: "Blue 64" });
    expect((bayer as HTMLButtonElement).disabled).toBe(true);
    await user.click(blue);
    expect((blue as HTMLButtonElement).disabled).toBe(true);
    expect((bayer as HTMLButtonElement).disabled).toBe(false);
  });
  it("switches the grain color", async () => {
    const user = userEvent.setup();
    render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
    const gray = screen.getByRole("button", { name: "Gray grain" });
    const color = screen.getByRole("button", { name: "Color grain" });
    expect((gray as HTMLButtonElement).disabled).toBe(true);
    await user.click(color);
    expect((color as HTMLButtonElement).disabled).toBe(true);
    expect((gray as HTMLButtonElement).disabled).toBe(false);
  });

  it("removes a palette entry when its swatch is deleted", async () => {
    const user = userEvent.setup();
    render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(lastCanvasSrc).toBeTruthy());
    const swatches = screen.getAllByTitle(/#[0-9A-F]{6}/i);
    const initial = swatches.length;
    expect(initial).toBeGreaterThanOrEqual(2);
    await user.click(swatches[0]);
    await user.click(screen.getByRole("button", { name: "x" }));
    expect(screen.getAllByTitle(/#[0-9A-F]{6}/i)).toHaveLength(initial - 1);
  });

  it("holds the canvas render for 200ms after a slider move", () => {
    vi.useFakeTimers();
    try {
      render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
      const initial = lastCanvasLevels;
      expect(initial).toBeGreaterThan(0);
      const levelsSlider = screen.getByRole("slider", { name: "Levels" });
      fireEvent.keyDown(levelsSlider, { key: "ArrowRight" });
      const live = Number(levelsSlider.getAttribute("aria-valuenow"));
      expect(lastCanvasLevels).toBe(initial);
      act(() => vi.advanceTimersByTime(200));
      expect(lastCanvasLevels).toBe(live);
      expect(live).not.toBe(initial);
    } finally {
      vi.useRealTimers();
    }
  });
  it("holds the canvas scale for 200ms after moving the scale slider", () => {
    vi.useFakeTimers();
    try {
      render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
      expect(lastCanvasScale).toBe(0.5);
      const scaleSlider = screen.getByRole("slider", { name: "Canvas scale" });
      fireEvent.keyDown(scaleSlider, { key: "ArrowRight" });
      const live = Number(scaleSlider.getAttribute("aria-valuenow"));
      expect(live).toBeCloseTo(0.55, 5);
      expect(lastCanvasScale).toBe(0.5);
      act(() => vi.advanceTimersByTime(200));
      expect(lastCanvasScale).toBe(live);
    } finally {
      vi.useRealTimers();
    }
  });
  it("applies a palette preset to the swatch strip", async () => {
    const user = userEvent.setup();
    render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(lastCanvasSrc).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "GameBoy" }));
    expect(screen.getAllByTitle(/#[0-9A-F]{6}/)).toHaveLength(4);
    expect(screen.getByTitle("#0F380F")).toBeTruthy();
  });

  it("extracts the palette from the image on demand", async () => {
    const user = userEvent.setup();
    const red = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: red })),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("Image", FakeImage);
    try {
      render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
      await waitFor(() => expect(lastCanvasSrc).toBeTruthy());
      await user.click(screen.getByRole("button", { name: "From image" }));
      await waitFor(() => expect(screen.getByTitle("#FF0000")).toBeTruthy());
    } finally {
      vi.unstubAllGlobals();
      getContext.mockRestore();
    }
  });

  it("applies every palette preset with its swatch count", async () => {
    const user = userEvent.setup();
    render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(lastCanvasSrc).toBeTruthy());
    const strip = screen.getByTitle("From image").closest("div")!;
    const pick = (name: string) => user.click(within(strip).getByRole("button", { name }));
    await pick("PICO-8");
    expect(screen.getAllByTitle(/#[0-9A-F]{6}/)).toHaveLength(16);
    await pick("Gray ramp");
    expect(screen.getAllByTitle(/#[0-9A-F]{6}/)).toHaveLength(8);
    await pick("Red ramp");
    expect(screen.getAllByTitle(/#[0-9A-F]{6}/)).toHaveLength(12);
    await pick("Default");
    expect(screen.getAllByTitle(/#[0-9A-F]{6}/)).toHaveLength(12);
  });

  it("re-applies a preset over an extracted palette", async () => {
    const user = userEvent.setup();
    const red = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    ]);
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: red })),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("Image", FakeImage);
    try {
      render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
      await waitFor(() => expect(lastCanvasSrc).toBeTruthy());
      await user.click(screen.getByRole("button", { name: "From image" }));
      await waitFor(() => expect(screen.getByTitle("#FF0000")).toBeTruthy());
      await user.click(screen.getByRole("button", { name: "GameBoy" }));
      expect(screen.getAllByTitle(/#[0-9A-F]{6}/)).toHaveLength(4);
      expect(screen.queryByTitle("#FF0000")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      getContext.mockRestore();
    }
  });

  it("notifies when palette extraction fails", async () => {
    const user = userEvent.setup();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("Image", FakeImage);
    try {
      render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
      await waitFor(() => expect(lastCanvasSrc).toBeTruthy());
      await user.click(screen.getByRole("button", { name: "From image" }));
      await waitFor(() =>
        expect(
          useNotificationStore
            .getState()
            .items.some((item) => item.message === "Could not read image colors.")
        ).toBe(true)
      );
    } finally {
      vi.unstubAllGlobals();
      getContext.mockRestore();
    }
  });
});
