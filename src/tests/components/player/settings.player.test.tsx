import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockConvertFileSrc, mockInvoke } from "@/tests/mocks";

vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke, convertFileSrc: mockConvertFileSrc }));

import SettingsPanel from "@/routes/components/player/media/settings.player";
import { DEFAULT_PLAYER_SETTINGS } from "@/store/player.store";
import { patchSettings } from "@/store/settings.store";
import type { PlayerSettings } from "@/types/player/videoPlayer";

const callbacks = () => {
  return {
    onPatchSettings: vi.fn(),
    onHwdec: vi.fn(),
    onSeekMode: vi.fn(),
    onEofMode: vi.fn(),
    onAutoHide: vi.fn(),
    onProfile: vi.fn(),
  };
};

const PANEL_DEFAULTS: PlayerSettings = { ...DEFAULT_PLAYER_SETTINGS };

const renderPanel = (settings: PlayerSettings = PANEL_DEFAULTS, streaming = false) => {
  const spies = callbacks();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsPanel
        settings={settings}
        hwdec="auto-safe"
        seekMode="keyframes"
        eofMode="none"
        autoHide={false}
        profile="basic"
        streaming={streaming}
        {...spies}
      />
    </QueryClientProvider>
  );

  return spies;
};

const chooseOption = async (
  combobox: HTMLElement,
  index: number,
  user: ReturnType<typeof userEvent.setup>
): Promise<void> => {
  await user.click(combobox);
  const options = await screen.findAllByRole("option");
  await user.click(options[index]);
};

const rootCheckboxes = (): HTMLElement[] => {
  return screen.getAllByRole("checkbox").filter((element) => element.tagName !== "INPUT");
};

beforeEach(() => {
  patchSettings({ language: "ru" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPanel selects", () => {
  it("hides the local playback profile for a stream", () => {
    renderPanel(PANEL_DEFAULTS, true);
    expect(screen.queryByText("Профиль воспроизведения (локальные файлы)")).toBeNull();
  });

  it.each([
    { control: 3, option: 1, payload: ["d3d11va"], spy: "onHwdec" },
    { control: 4, option: 1, payload: ["exact"], spy: "onSeekMode" },
    { control: 5, option: 1, payload: ["pause"], spy: "onEofMode" },
    { control: 6, option: 1, payload: ["speed"], spy: "onProfile" },
    { control: 7, option: 1, payload: [{ targetPrim: "bt.709" }], spy: "onPatchSettings" },
    { control: 8, option: 2, payload: [{ targetTrc: "srgb" }], spy: "onPatchSettings" },
    { control: 9, option: 1, payload: [{ toneMap: "manual" }], spy: "onPatchSettings" },
    { control: 10, option: 1, payload: [{ subFontFamily: "Verdana" }], spy: "onPatchSettings" },
  ])("select $control applies its value", async ({ control, option, payload, spy }) => {
    const user = userEvent.setup();
    const spies = renderPanel();
    const boxes = screen
      .getAllByRole("combobox")
      .filter(
        (box) =>
          !["Устройство вывода", "Язык аудио", "Язык субтитров"].includes(
            box.getAttribute("aria-label") ?? ""
          )
      );
    await chooseOption(boxes[control], option, user);
    expect(spies[spy as keyof typeof spies]).toHaveBeenCalledWith(...payload);
  });
});

describe("SettingsPanel screen modes", () => {
  it("offers the Windows loupe by default and lets the viewer choose MPV", async () => {
    const user = userEvent.setup();
    const spies = renderPanel();
    const select = screen.getByRole("combobox", { name: "Режим лупы" });
    expect(select.textContent).toContain("Нативная Windows");
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Шейдер MPV" }));
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ loupeMode: "shader" });
  });

  it("switches the player mode", async () => {
    const user = userEvent.setup();
    const spies = renderPanel();
    await chooseOption(screen.getByRole("combobox", { name: "Режим плеера" }), 1, user);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ playerMode: "tv" });
  });

  it("keeps the cabinet and hides curvature in the normal mode", () => {
    renderPanel();
    expect(screen.queryByRole("combobox", { name: "Корпус" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Кривизна" })).toBeNull();
  });

  it("shows cabinet and curvature for the television mode", () => {
    renderPanel({ ...DEFAULT_PLAYER_SETTINGS, playerMode: "tv" });
    expect(screen.queryByRole("combobox", { name: "Корпус" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Кривизна" })).not.toBeNull();
  });

  it("shows the cabinet without curvature for the monitor mode", () => {
    renderPanel({ ...DEFAULT_PLAYER_SETTINGS, playerMode: "monitor" });
    expect(screen.queryByRole("combobox", { name: "Корпус" })).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "Кривизна" })).toBeNull();
  });

  it("applies cabinet and curvature selections", async () => {
    const user = userEvent.setup();
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS, playerMode: "tv" });
    await chooseOption(screen.getByRole("combobox", { name: "Корпус" }), 2, user);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ cabinet: "wood" });
    await chooseOption(screen.getByRole("combobox", { name: "Кривизна" }), 2, user);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ crtCurvature: 0.07 });
  });

  it("turns the cabinet off again", async () => {
    const user = userEvent.setup();
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS, cabinet: "wood" });
    await chooseOption(screen.getByRole("combobox", { name: "Корпус" }), 0, user);
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
  it("switches debanding immediately", async () => {
    const user = userEvent.setup();
    const spies = renderPanel();
    const checkbox = screen.getByRole("checkbox", { name: "Сгладить цветовые полосы" });
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    await user.click(checkbox);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ deband: true });
  });
  it("pauses the next episode by default and lets the viewer turn it off", async () => {
    const user = userEvent.setup();
    const spies = renderPanel();
    const checkbox = screen.getByRole("checkbox", { name: "Ставить следующий эпизод на паузу" });
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    await user.click(checkbox);
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ pauseNextEpisode: false });
  });

  it.each([
    { control: 1, payload: [true], spy: "onAutoHide", manual: false },
    { control: 3, payload: [{ loudnorm: true }], spy: "onPatchSettings", manual: false },
    { control: 1, payload: [true], spy: "onAutoHide", manual: true },
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
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ ...DEFAULT_PLAYER_SETTINGS });
  });
});

describe("SettingsPanel conditional HDR controls", () => {
  it("hides manual HDR controls in auto mode", () => {
    renderPanel({ ...DEFAULT_PLAYER_SETTINGS, toneMap: "auto" });
    expect(screen.queryByRole("slider", { name: /Пик дисплея/ })).toBeNull();
  });

  it("shows manual HDR controls and wires the peak slider", () => {
    const spies = renderPanel({ ...DEFAULT_PLAYER_SETTINGS, toneMap: "manual" });
    const peak = screen.getByRole("slider", { name: /Пик дисплея/ });
    fireEvent.keyDown(peak, { key: "ArrowRight" });
    expect(spies.onPatchSettings).toHaveBeenCalledWith({ targetPeak: 1050 });
  });
});

it("selects a preferred language and restores mpv automatic selection", async () => {
  const user = userEvent.setup();
  const spies = renderPanel();
  await user.click(screen.getByRole("combobox", { name: "Язык аудио" }));
  await user.click(await screen.findByRole("option", { name: "Японский" }));
  expect(spies.onPatchSettings).toHaveBeenCalledWith({ audioLanguage: "ja" });
  await user.click(screen.getByRole("combobox", { name: "Язык субтитров" }));
  await user.click(await screen.findByRole("option", { name: "Выбор mpv" }));
  expect(spies.onPatchSettings).toHaveBeenCalledWith({ subtitleLanguage: "" });
});
