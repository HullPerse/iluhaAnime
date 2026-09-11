import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ditherDecodeCache, ditherRenderCache } from "@/lib/utils/dither.utils";
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

function installCanvasHarness(source: Uint8ClampedArray) {
  const context = {
    drawImage: vi.fn(() => {}),
    getImageData: vi.fn(() => ({ data: source })),
    imageSmoothingEnabled: true,
    putImageData: vi.fn(() => {}),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  function FakeImageData(data: Uint8ClampedArray, width: number, height: number) {
    return { data, width, height };
  }
  vi.stubGlobal("ImageData", FakeImageData as unknown as typeof ImageData);
}

function installImageHarness(naturalWidth: number, naturalHeight: number) {
  const instances: Array<{ fireLoad: () => void }> = [];
  class MockImage {
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    #src = "";
    get src(): string {
      return this.#src;
    }
    set src(value: string) {
      this.#src = value;
      instances.push({
        fireLoad: () => {
          this.onload?.();
        },
      });
    }
  }
  vi.stubGlobal("Image", MockImage as unknown as typeof Image);
  return instances;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  useSettingsStore.setState({ language: "en" });
  useNotificationStore.setState({ items: [], unreadCount: 0, dismissed: [] });
  mockInvoke.mockReset();
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,BAKED");
});

describe("DitherPreviewModal save wiring", () => {
  it("bakes the hidden full-frame canvas on save", async () => {
    const user = userEvent.setup();
    ditherRenderCache.clear();
    ditherDecodeCache.clear();
    const updated = toUserImage(UPDATED_FILE);
    mockInvoke.mockResolvedValue(UPDATED_FILE);
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    installCanvasHarness(source);
    const images = installImageHarness(4, 2);
    const bitmap = { width: 4, height: 2, close: vi.fn() };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap)
    );
    const onBack = vi.fn();
    const onSaved = vi.fn();
    render(<DitherPreviewModal image={IMAGE} onBack={onBack} onSaved={onSaved} />);
    await act(async () => {
      images[0].fireLoad();
    });
    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false));
    await user.click(saveButton);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_dither_image_data", {
        id: "aaa",
        dataUrl: "data:image/png;base64,BAKED",
      })
    );
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("DitherPreviewModal save wiring under StrictMode", () => {
  it("bakes the hidden full-frame canvas on save", async () => {
    const user = userEvent.setup();
    ditherRenderCache.clear();
    ditherDecodeCache.clear();
    const updated = toUserImage(UPDATED_FILE);
    mockInvoke.mockResolvedValue(UPDATED_FILE);
    const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
    installCanvasHarness(source);
    const images = installImageHarness(4, 2);
    const bitmap = { width: 4, height: 2, close: vi.fn() };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap)
    );
    const onBack = vi.fn();
    const onSaved = vi.fn();
    render(
      <StrictMode>
        <DitherPreviewModal image={IMAGE} onBack={onBack} onSaved={onSaved} />
      </StrictMode>
    );
    await act(async () => {
      for (const image of images) image.fireLoad();
    });
    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect((saveButton as HTMLButtonElement).disabled).toBe(false));
    await user.click(saveButton);
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("update_dither_image_data", {
        id: "aaa",
        dataUrl: "data:image/png;base64,BAKED",
      })
    );
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("names the stuck stage instead of spinning forever", async () => {
    vi.useFakeTimers();
    ditherRenderCache.clear();
    ditherDecodeCache.clear();
    try {
      let resolveUpdate!: (value: UserImageFile) => void;
      mockInvoke.mockImplementation(
        () =>
          new Promise<UserImageFile>((resolve) => {
            resolveUpdate = resolve;
          })
      );
      const source = new Uint8ClampedArray(2 * 1 * 4).fill(200);
      installCanvasHarness(source);
      const images = installImageHarness(4, 2);
      const bitmap = { width: 4, height: 2, close: vi.fn() };
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => bitmap)
      );
      render(<DitherPreviewModal image={IMAGE} onBack={vi.fn()} onSaved={vi.fn()} />);
      await act(async () => {
        images[0].fireLoad();
      });
      const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
      expect(saveButton.disabled).toBe(false);
      ditherRenderCache.clear();
      fireEvent.click(saveButton);
      expect(saveButton.disabled).toBe(true);
      expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
      expect(screen.getByText("100%")).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });
      const messages = useNotificationStore
        .getState()
        .items.filter((item) => item.type === "error")
        .map((item) => item.message);
      expect(messages).toContain("The database did not answer within 30 seconds.");
      expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(
        false
      );
      await act(async () => {
        resolveUpdate(UPDATED_FILE);
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
