import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsTheme from "@/routes/components/settings/theme.settings";
import { useSettingsStore } from "@/store/settings.store";
import { useThemeStore } from "@/store/theme.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

function experimentalToggle(label: string): HTMLElement {
  const row = screen.getByText(label).parentElement;
  if (!row) throw new Error(`row not found for ${label}`);
  return within(row).getByRole("checkbox");
}

function tintSlider(): HTMLElement {
  const row = screen.getByText("Tint opacity").parentElement;
  if (!row) throw new Error("tint row not found");
  return within(row).getByRole("slider");
}

type ChromeArgs = { decorations: boolean; effect: string; roundedCorners: boolean };

function chromeCalls(): unknown[][] {
  return (mockInvoke.mock.calls as unknown[][]).filter((call) => call[0] === "set_window_chrome");
}

function lastChromeArgs(): ChromeArgs | undefined {
  return chromeCalls().at(-1)?.[1] as ChromeArgs | undefined;
}

afterEach(() => cleanup());

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string) =>
    command === "list_system_fonts" ? Promise.resolve([]) : Promise.resolve(undefined)
  );
  useSettingsStore.setState({
    language: "en",
    searchMascotEnabled: false,
    statusBarEnabled: true,
    customTitleBarEnabled: true,
    roundedWindowCorners: false,
    windowEffect: "none",
    windowTintOpacity: null,
  });
});

describe("SettingsTheme experimental section", () => {
  it("lists the four experimental toggles", () => {
    render(<SettingsTheme />);
    expect(screen.getByText("Observer")).toBeTruthy();
    expect(screen.getByText("Status bar")).toBeTruthy();
    expect(screen.getByText("Custom title bar")).toBeTruthy();
    expect(screen.getByText("Rounded window corners")).toBeTruthy();
    expect(screen.getByText("Windows only")).toBeTruthy();
  });

  it("no longer shows the removed search style hint", () => {
    render(<SettingsTheme />);
    expect(screen.queryByText("Change the style of search tab")).toBeNull();
  });

  it("turns the observer on without touching the window", async () => {
    const user = userEvent.setup();
    render(<SettingsTheme />);

    await user.click(experimentalToggle("Observer"));

    expect(useSettingsStore.getState().searchMascotEnabled).toBe(true);
    expect(chromeCalls()).toHaveLength(0);
  });

  it("hides the status bar from the store", async () => {
    const user = userEvent.setup();
    render(<SettingsTheme />);

    await user.click(experimentalToggle("Status bar"));

    expect(useSettingsStore.getState().statusBarEnabled).toBe(false);
  });

  it("switches to native decorations when the custom title bar is disabled", async () => {
    const user = userEvent.setup();
    render(<SettingsTheme />);

    await user.click(experimentalToggle("Custom title bar"));

    expect(useSettingsStore.getState().customTitleBarEnabled).toBe(false);
    expect(lastChromeArgs()).toEqual({
      decorations: true,
      effect: "none",
      roundedCorners: false,
    });
  });

  it("applies rounded corners through the window command", async () => {
    const user = userEvent.setup();
    render(<SettingsTheme />);

    await user.click(experimentalToggle("Rounded window corners"));

    expect(useSettingsStore.getState().roundedWindowCorners).toBe(true);
    expect(lastChromeArgs()).toEqual({
      decorations: false,
      effect: "none",
      roundedCorners: true,
    });
  });
});

describe("SettingsTheme window effect", () => {
  it("offers every supported effect plus the off state", async () => {
    const user = userEvent.setup();
    render(<SettingsTheme />);

    expect(screen.getByText("Window effect")).toBeTruthy();
    expect(await screen.findByText("None")).toBeTruthy();

    await user.click(screen.getByRole("combobox", { name: "Window effect" }));
    expect(await screen.findByText("Acrylic (Windows 10/11)")).toBeTruthy();
    expect(screen.getByText("Mica (Windows 11)")).toBeTruthy();
    expect(screen.getByText("Tabbed (Windows 11 22H2+)")).toBeTruthy();
  });

  it("sends the chosen material through the window command", async () => {
    const user = userEvent.setup();
    render(<SettingsTheme />);

    await user.click(screen.getByRole("combobox", { name: "Window effect" }));
    await user.click(await screen.findByText("Mica (Windows 11)"));

    expect(useSettingsStore.getState().windowEffect).toBe("mica");
    expect(lastChromeArgs()).toEqual({
      decorations: false,
      effect: "mica",
      roundedCorners: false,
    });
  });

  it("starts the tint slider on the theme's own readable value", () => {
    render(<SettingsTheme />);
    expect(tintSlider().getAttribute("aria-valuenow")).toBe("0.72");
    expect(useSettingsStore.getState().windowTintOpacity).toBeNull();
    expect(screen.queryByText(/Thinner than this theme/)).toBeNull();
  });

  it("stores a thinner tint and warns that this theme cannot afford it", () => {
    render(<SettingsTheme />);

    fireEvent.keyDown(tintSlider(), { key: "ArrowLeft" });

    expect(useSettingsStore.getState().windowTintOpacity).toBeCloseTo(0.67, 5);
    expect(
      screen.getByText("Thinner than this theme can afford - text may become hard to read.")
    ).toBeTruthy();
  });

  it("stores a more solid tint without warning", () => {
    render(<SettingsTheme />);

    fireEvent.keyDown(tintSlider(), { key: "ArrowRight" });

    expect(useSettingsStore.getState().windowTintOpacity).toBeCloseTo(0.77, 5);
    expect(screen.queryByText(/Thinner than this theme/)).toBeNull();
  });

  it("hands the tint back to the theme when the reset is clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsTheme />);

    const reset = screen.getByRole("button", { name: "Reset to theme" });
    expect(reset.hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(tintSlider(), { key: "ArrowLeft" });
    expect(useSettingsStore.getState().windowTintOpacity).toBeCloseTo(0.67, 5);

    await user.click(reset);

    expect(useSettingsStore.getState().windowTintOpacity).toBeNull();
    expect(tintSlider().getAttribute("aria-valuenow")).toBe("0.72");
    expect(screen.queryByText(/Thinner than this theme/)).toBeNull();
  });
});

describe("SettingsTheme yorha grid toggle", () => {
  it("shows the grid toggle only for the yorha theme", () => {
    useThemeStore.setState({ currentTheme: "win95" });
    const first = render(<SettingsTheme />);
    expect(screen.queryByText("YoRHa grid")).toBeNull();
    first.unmount();
    useThemeStore.setState({ currentTheme: "yorha" });
    render(<SettingsTheme />);
    expect(screen.getByText("YoRHa grid")).toBeTruthy();
  });

  it("flips the stored grid flag from the yorha toggle", async () => {
    const user = userEvent.setup();
    useThemeStore.setState({ currentTheme: "yorha" });
    useSettingsStore.setState({ yorhaScanlinesEnabled: true });
    render(<SettingsTheme />);
    await user.click(experimentalToggle("YoRHa grid"));
    expect(useSettingsStore.getState().yorhaScanlinesEnabled).toBe(false);
  });
});
