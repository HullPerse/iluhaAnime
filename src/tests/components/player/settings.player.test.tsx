import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import SettingsPanel from "@/routes/components/player/media/settings.player";
import { DEFAULT_PLAYER_SETTINGS } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { PlayerSettings } from "@/types/videoPlayer";

function callbacks() {
  return {
    onPatchSettings: vi.fn(),
    onHwdec: vi.fn(),
    onSeekMode: vi.fn(),
    onEofMode: vi.fn(),
    onAutoHide: vi.fn(),
    onProfile: vi.fn(),
  };
}

const PANEL_DEFAULTS: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS };

function renderPanel(settings: PlayerSettings = PANEL_DEFAULTS) {
  const spies = callbacks();
  render(
    <SettingsPanel
      settings={settings}
      hwdec="auto-safe"
      seekMode="keyframes"
      eofMode="none"
      autoHide={false}
      profile="basic"
      {...spies}
    />
  );
  return spies;
}

async function chooseOption(
  combobox: HTMLElement,
  index: number,
  user: ReturnType<typeof userEvent.setup>
): Promise<void> {
  await user.click(combobox);
  const options = await screen.findAllByRole("option");
  await user.click(options[index]);
}

function rootCheckboxes(): HTMLElement[] {
  // Base-UI renders a hidden form input per checkbox ahead of the clickable
  // root; only the root forwards to onCheckedChange.
  return screen.getAllByRole("checkbox").filter((element) => element.tagName !== "INPUT");
}

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPanel selects", () => {
  it.each([
    { control: 0, option: 1, payload: ["d3d11va"], spy: "onHwdec" },
    { control: 1, option: 1, payload: ["exact"], spy: "onSeekMode" },
    { control: 2, option: 1, payload: ["pause"], spy: "onEofMode" },
    { control: 3, option: 1, payload: ["speed"], spy: "onProfile" },
    { control: 4, option: 1, payload: [{ aspectRatio: "fill" }], spy: "onPatchSettings" },
    { control: 5, option: 1, payload: [{ targetPrim: "bt.709" }], spy: "onPatchSettings" },
    { control: 6, option: 2, payload: [{ targetTrc: "srgb" }], spy: "onPatchSettings" },
    { control: 7, option: 1, payload: [{ toneMap: "manual" }], spy: "onPatchSettings" },
    { control: 8, option: 1, payload: [{ subFontFamily: "Verdana" }], spy: "onPatchSettings" },
  ])("select $control applies its value", async ({ control, option, payload, spy }) => {
    const user = userEvent.setup();
    const spies = renderPanel();
    const boxes = screen.getAllByRole("combobox");
    await chooseOption(boxes[control], option, user);
    expect(spies[spy as keyof typeof spies]).toHaveBeenCalledWith(...payload);
  });
});

describe("SettingsPanel sliders", () => {
  it.each([
    { control: 0, key: "rotation", from: 0, expected: 1 },
    { control: 1, key: "zoom", from: 1, expected: 1.01 },
    { control: 2, key: "brightness", from: 100, expected: 101 },
    { control: 3, key: "contrast", from: 100, expected: 101 },
    { control: 4, key: "saturation", from: 100, expected: 101 },
    { control: 5, key: "hue", from: 0, expected: 1 },
    { control: 6, key: "blur", from: 0, expected: 0.5 },
    { control: 7, key: "sepia", from: 0, expected: 1 },
    { control: 8, key: "grayscale", from: 0, expected: 1 },
    { control: 9, key: "subFontSize", from: 18, expected: 19 },
    { control: 10, key: "subBgOpacity", from: 0, expected: 1 },
  ])("slider $key steps on ArrowRight", ({ control, key, from, expected }) => {
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS });
    expect(spies.onPatchSettings).not.toHaveBeenCalled();
    const sliders = screen.getAllByRole("slider");
    expect(sliders[control].getAttribute("aria-valuenow")).toBe(String(from));
    fireEvent.keyDown(sliders[control], { key: "ArrowRight" });
    expect(spies.onPatchSettings).toHaveBeenCalledTimes(1);
    expect(spies.onPatchSettings.mock.calls[0][0][key]).toBeCloseTo(expected, 10);
  });
});

describe("SettingsPanel checkboxes", () => {
  it.each([
    { control: 0, payload: [true], spy: "onAutoHide", manual: false },
    { control: 1, payload: [{ flipH: true }], spy: "onPatchSettings", manual: false },
    { control: 2, payload: [{ flipV: true }], spy: "onPatchSettings", manual: false },
    { control: 3, payload: [{ loudnorm: true }], spy: "onPatchSettings", manual: false },
    { control: 0, payload: [true], spy: "onAutoHide", manual: true },
    { control: 1, payload: [{ flipH: true }], spy: "onPatchSettings", manual: true },
    { control: 2, payload: [{ flipV: true }], spy: "onPatchSettings", manual: true },
    { control: 3, payload: [{ hdrComputePeak: true }], spy: "onPatchSettings", manual: true },
    { control: 4, payload: [{ loudnorm: true }], spy: "onPatchSettings", manual: true },
  ])("checkbox $control toggles", async ({ control, payload, spy, manual }) => {
    const user = userEvent.setup();
    const spies = renderPanel(
      manual ? { ...DEFAULT_PLAYER_SETTINGS, toneMap: "manual" } : { ...DEFAULT_PLAYER_SETTINGS }
    );
    const boxes = rootCheckboxes();
    await user.click(boxes[control]);
    expect(spies[spy as keyof typeof spies]).toHaveBeenCalledWith(...payload);
  });
});

describe("SettingsPanel colors and reset", () => {
  it("applies picked subtitle colors", () => {
    const spies = renderPanel();
    const inputs = screen.getAllByDisplayValue(/^#[0-9a-fA-F]{6}$/);
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[0], { target: { value: "#ff0000" } });
    fireEvent.change(inputs[1], { target: { value: "#00ff00" } });
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ subColor: "#ff0000" });
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ subBgColor: "#00ff00" });
  });

  it("resets to defaults", () => {
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS, brightness: 150 });
    fireEvent.click(screen.getByRole("button"));
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ ...DEFAULT_PLAYER_SETTINGS });
  });
});

describe("SettingsPanel conditional HDR controls", () => {
  it("hides manual HDR controls in auto mode", () => {
    renderPanel({ ...DEFAULT_PLAYER_SETTINGS, toneMap: "auto" });
    expect(screen.queryByRole("slider", { name: /peak/i })).toBeNull();
  });

  it("shows manual HDR controls and wires the peak slider", () => {
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS, toneMap: "manual" });
    const peak = screen.getByRole("slider", { name: /peak/i });
    fireEvent.keyDown(peak, { key: "ArrowRight" });
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ targetPeak: 1050 });
  });
});
