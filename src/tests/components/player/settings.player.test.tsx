import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockConvertFileSrc, mockInvoke } from "../../mocks";

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke, convertFileSrc: mockConvertFileSrc }));

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
    { control: 2, option: 1, payload: ["d3d11va"], spy: "onHwdec" },
    { control: 3, option: 1, payload: ["exact"], spy: "onSeekMode" },
    { control: 4, option: 1, payload: ["pause"], spy: "onEofMode" },
    { control: 5, option: 1, payload: ["speed"], spy: "onProfile" },
    { control: 6, option: 1, payload: [{ targetPrim: "bt.709" }], spy: "onPatchSettings" },
    { control: 7, option: 2, payload: [{ targetTrc: "srgb" }], spy: "onPatchSettings" },
    { control: 8, option: 1, payload: [{ toneMap: "manual" }], spy: "onPatchSettings" },
    { control: 9, option: 1, payload: [{ subFontFamily: "Verdana" }], spy: "onPatchSettings" },
  ])("select $control applies its value", async ({ control, option, payload, spy }) => {
    const user = userEvent.setup();
    const spies = renderPanel();
    const boxes = screen.getAllByRole("combobox");
    await chooseOption(boxes[control], option, user);
    expect(spies[spy as keyof typeof spies]).toHaveBeenCalledWith(...payload);
  });
});

describe("SettingsPanel screen modes", () => {
  it("switches the player mode", async () => {
    const user = userEvent.setup();
    const spies = renderPanel();
    await chooseOption(screen.getByRole("combobox", { name: "Player mode" }), 1, user);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ playerMode: "tv" });
  });

  it("keeps the cabinet and hides curvature in the normal mode", () => {
    renderPanel();
    expect(screen.queryByRole("combobox", { name: "Cabinet" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Curvature" })).toBeNull();
  });

  it("shows cabinet and curvature for the television mode", () => {
    renderPanel({ ...DEFAULT_PLAYER_SETTINGS, playerMode: "tv" });
    expect(screen.queryByRole("combobox", { name: "Cabinet" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Curvature" })).not.toBeNull();
  });

  it("shows the cabinet without curvature for the monitor mode", () => {
    renderPanel({ ...DEFAULT_PLAYER_SETTINGS, playerMode: "monitor" });
    expect(screen.queryByRole("combobox", { name: "Cabinet" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Curvature" })).toBeNull();
  });

  it("applies cabinet and curvature selections", async () => {
    const user = userEvent.setup();
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS, playerMode: "tv" });
    await chooseOption(screen.getByRole("combobox", { name: "Cabinet" }), 2, user);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ cabinet: "wood" });
    await chooseOption(screen.getByRole("combobox", { name: "Curvature" }), 2, user);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ crtCurvature: 0.07 });
  });

  it("turns the cabinet off again", async () => {
    const user = userEvent.setup();
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS, cabinet: "wood" });
    await chooseOption(screen.getByRole("combobox", { name: "Cabinet" }), 0, user);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ cabinet: "none" });
  });
});

describe("SettingsPanel sliders", () => {
  it.each([
    { control: 0, key: "brightness", from: 100, expected: 101 },
    { control: 1, key: "contrast", from: 100, expected: 101 },
    { control: 2, key: "saturation", from: 100, expected: 101 },
    { control: 3, key: "hue", from: 0, expected: 1 },
    { control: 4, key: "subFontSize", from: 18, expected: 19 },
    { control: 5, key: "subBgOpacity", from: 0, expected: 1 },
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
    { control: 1, payload: [{ loudnorm: true }], spy: "onPatchSettings", manual: false },
    { control: 0, payload: [true], spy: "onAutoHide", manual: true },
    { control: 1, payload: [{ hdrComputePeak: true }], spy: "onPatchSettings", manual: true },
    { control: 2, payload: [{ loudnorm: true }], spy: "onPatchSettings", manual: true },
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
