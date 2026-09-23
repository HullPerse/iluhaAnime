import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTray } from "@/hooks/tray.hook";
import { useSettingsStore } from "@/store/settings.store";
import type { TabId } from "@/types/settings";

const show = vi.fn(() => Promise.resolve());
const hide = vi.fn(() => Promise.resolve());
const unminimize = vi.fn(() => Promise.resolve());
const setFocus = vi.fn(() => Promise.resolve());
const close = vi.fn(() => Promise.resolve());
const unlisten = vi.fn();
let closeHandler: ((event: { preventDefault: () => void }) => void) | undefined;

const onCloseRequested = vi.fn((handler: (event: { preventDefault: () => void }) => void) => {
  closeHandler = handler;
  return Promise.resolve(unlisten);
});

const windowMock = { show, hide, unminimize, setFocus, close, onCloseRequested };

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => windowMock,
}));

const setMenu = vi.fn(() => Promise.resolve());
let trayOptions: {
  id?: string;
  tooltip?: string;
  showMenuOnLeftClick?: boolean;
  action?: (event: { type: string; button: string }) => void;
} | null = null;
const trayNew = vi.fn((options: unknown) => {
  trayOptions = options as typeof trayOptions;
  return Promise.resolve({ setMenu });
});
const trayGetById = vi.fn((): Promise<unknown> => Promise.resolve(null));

vi.mock("@tauri-apps/api/tray", () => ({
  TrayIcon: {
    getById: () => trayGetById(),
    new: (options: unknown) => trayNew(options),
  },
}));

let menuItems: {
  id?: string;
  text?: string;
  item?: string;
  action?: () => void;
}[] = [];
const menuNew = vi.fn((options: unknown) => {
  menuItems = (options as { items: typeof menuItems }).items;
  return Promise.resolve({});
});

vi.mock("@tauri-apps/api/menu", () => ({
  Menu: {
    new: (options: unknown) => menuNew(options),
  },
}));

vi.mock("@tauri-apps/api/app", () => ({
  defaultWindowIcon: () => Promise.resolve(null),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(undefined),
}));

const tabs = [
  { id: "search", label: "Search" },
  { id: "settings", label: "Settings" },
] as { id: TabId; label: string }[];

beforeEach(() => {
  useSettingsStore.setState({ language: "ru", minimizeToTray: false });
  closeHandler = undefined;
  trayOptions = null;
  menuItems = [];
  for (const spy of [
    show,
    hide,
    unminimize,
    setFocus,
    close,
    unlisten,
    onCloseRequested,
    setMenu,
    trayNew,
    trayGetById,
    menuNew,
  ]) {
    spy.mockClear();
  }
});

async function renderTray(onSelectTab: (tab: TabId) => void = () => {}) {
  const view = renderHook(() => useTray(tabs, onSelectTab));
  await waitFor(() => expect(trayNew).toHaveBeenCalledTimes(1));
  return view;
}

describe("useTray", () => {
  it("creates one tray icon with the menu hidden on left click", async () => {
    await renderTray();
    expect(trayNew).toHaveBeenCalledTimes(1);
    expect(trayOptions?.id).toBe("iluhaanime-tray");
    expect(trayOptions?.tooltip).toBe("iluhaAnime");
    expect(trayOptions?.showMenuOnLeftClick).toBe(false);
  });

  it("lists the visible tabs plus a quit item in the context menu", async () => {
    await renderTray();
    expect(menuItems.map((item) => item.id ?? item.item)).toEqual([
      "tray-tab-search",
      "tray-tab-settings",
      "Separator",
      "tray-quit",
    ]);
    expect(menuItems[3]?.text).toBe("Выйти");
  });

  it("opens the window on a left click but not on a right click", async () => {
    await renderTray();
    trayOptions?.action?.({ type: "Click", button: "Right" });
    expect(show).not.toHaveBeenCalled();
    trayOptions?.action?.({ type: "Click", button: "Left" });
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(unminimize).toHaveBeenCalledTimes(1);
    expect(setFocus).toHaveBeenCalledTimes(1);
  });

  it("switches to the tab and opens the window from the context menu", async () => {
    const onSelectTab = vi.fn();
    await renderTray(onSelectTab);
    menuItems.find((item) => item.id === "tray-tab-settings")?.action?.();
    expect(onSelectTab).toHaveBeenCalledWith("settings");
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
  });

  it("hides the window instead of closing when minimize to tray is on", async () => {
    useSettingsStore.setState({ minimizeToTray: true });
    await renderTray();
    const preventDefault = vi.fn();
    closeHandler?.({ preventDefault });
    await waitFor(() => expect(hide).toHaveBeenCalledTimes(1));
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes normally when minimize to tray is off", async () => {
    await renderTray();
    const preventDefault = vi.fn();
    closeHandler?.({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("lets the tray quit item close the app for real", async () => {
    useSettingsStore.setState({ minimizeToTray: true });
    await renderTray();
    menuItems.find((item) => item.id === "tray-quit")?.action?.();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    const preventDefault = vi.fn();
    closeHandler?.({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("attaches the menu to the backend tray icon instead of creating one", async () => {
    trayGetById.mockResolvedValueOnce({ setMenu });
    renderHook(() => useTray(tabs, () => {}));
    await waitFor(() => expect(menuNew).toHaveBeenCalledTimes(1));
    expect(trayNew).not.toHaveBeenCalled();
    expect(setMenu).toHaveBeenCalledTimes(1);
  });
});
