import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEMES } from "@/config/settings/themes.config";
import ThemeEditor from "@/routes/components/settings/theme/editor.theme";
import { useSettingsStore } from "@/store/settings.store";
import { useThemeStore } from "@/store/theme.store";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = "";
  get src(): string {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.());
  }
}

const PALETTE_PIXELS = new Uint8ClampedArray([
  16, 16, 24, 255, 16, 16, 24, 255, 122, 162, 247, 255, 122, 162, 247, 255, 240, 240, 255, 255, 240,
  240, 255, 255,
]);

function uploadPalette() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: PALETTE_PIXELS }),
  } as unknown as CanvasRenderingContext2D);
  const input = document.querySelector('input[type="file"]');
  if (input === null) throw new Error("file input missing");
  fireEvent.change(input, {
    target: { files: [new File(["x"], "palette.png", { type: "image/png" })] },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage);
  useSettingsStore.setState({ language: "en" });
  useThemeStore.setState({ currentTheme: "win95", customThemes: [] });
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:palette"),
    revokeObjectURL: vi.fn(),
  });
});

describe("ThemeEditor palette", () => {
  it("pulls a palette from an uploaded image", async () => {
    render(<ThemeEditor onClose={vi.fn()} />);
    expect(screen.getByText("Load an image and a palette is pulled from it.")).toBeTruthy();

    uploadPalette();

    expect(await screen.findByLabelText("#101018")).toBeTruthy();
    expect(screen.getByLabelText("#7aa2f7")).toBeTruthy();
    expect(screen.getByText("Pick a colour row, then click a swatch.")).toBeTruthy();
  });

  it("applies a swatch to the selected colour row", async () => {
    const user = userEvent.setup();
    render(<ThemeEditor onClose={vi.fn()} />);
    uploadPalette();
    await screen.findByLabelText("#7aa2f7");

    await user.click(screen.getByRole("button", { name: "Accent" }));
    await user.click(screen.getByLabelText("#7aa2f7"));

    expect(screen.getByText("#7aa2f7")).toBeTruthy();
  });

  it("maps a whole palette onto the theme", async () => {
    const user = userEvent.setup();
    render(<ThemeEditor onClose={vi.fn()} />);
    uploadPalette();
    await screen.findByLabelText("#7aa2f7");

    await user.click(screen.getByRole("button", { name: /Apply to theme/ }));

    expect(await screen.findByText("#f0f0ff")).toBeTruthy();
  });

  it("saves the edited theme and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ThemeEditor onClose={onClose} />);

    await user.type(screen.getByPlaceholderText("My theme"), "Night Owl");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const saved = useThemeStore.getState().customThemes;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ label: "Night Owl", name: "custom-night-owl" });
  });
});

describe("ThemeEditor shape metadata", () => {
  it("reads the shape of the theme being edited back out on save", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const win11 = THEMES.find((item) => item.name === "win11")!;
    render(<ThemeEditor onClose={onClose} theme={win11} />);

    expect(screen.getByText("Corners")).toBeTruthy();
    expect(screen.getByText("Bevel")).toBeTruthy();
    expect(screen.getByText("Frame and controls (Windows 11)")).toBeTruthy();
    expect(screen.getByText("Flat (Windows 7/11)")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(useThemeStore.getState().customThemes[0]).toMatchObject({
      bevel: "flat",
      radius: "all",
    });
  });

  it("defaults a new theme to a square, raised frame", async () => {
    const user = userEvent.setup();
    render(<ThemeEditor onClose={vi.fn()} />);

    expect(screen.getByText("Square")).toBeTruthy();
    expect(screen.getByText("Raised (Windows 95/XP)")).toBeTruthy();

    await user.type(screen.getByPlaceholderText("My theme"), "Plain");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(useThemeStore.getState().customThemes).toHaveLength(1));
    expect(useThemeStore.getState().customThemes[0]).toMatchObject({
      bevel: "raised",
      radius: "none",
    });
  });
});
