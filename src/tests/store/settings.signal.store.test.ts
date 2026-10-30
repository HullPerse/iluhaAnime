import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "@/tests/mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import { DEFAULT_SETTINGS } from "@/config/settings/settingsDefaults.config";
import { PlayerVisibilityService } from "@/lib/player/playerVisibility.utils";
import {
  createSettingsSignalStore,
  SETTINGS_SCHEMA_VERSION,
  type SettingsSignalStore,
} from "@/store/settings.store";

function memoryStorage(backing = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  };
}

function setup(backing = new Map<string, string>()): {
  store: SettingsSignalStore;
  backing: Map<string, string>;
} {
  const store = createSettingsSignalStore({ getStorage: () => memoryStorage(backing) });
  return { store, backing };
}

beforeEach(() => {
  mockInvoke.mockReset();
  document.documentElement.dataset.retroStyle = "classic";
});

describe("settings signal defaults", () => {
  it("starts from default settings", () => {
    const { store } = setup();
    expect(store.atoms.pageSize.get()).toBe(DEFAULT_SETTINGS.pageSize);
    expect(store.atoms.resultsPerPage.get()).toBe(DEFAULT_SETTINGS.resultsPerPage);
    expect(["en", "ru"]).toContain(store.atoms.language.get());
  });

  it("holds pure data without functions", () => {
    const { store } = setup();
    const snapshot = store.snapshot();
    expect(Object.keys(snapshot).length).toBe(Object.keys(DEFAULT_SETTINGS).length + 1);
    for (const value of Object.values(snapshot)) {
      expect(typeof value).not.toBe("function");
    }
  });
});

describe("settings signal legacy fallback", () => {
  it("migrates legacy limits and locale from the zustand envelope", () => {
    const backing = new Map<string, string>([
      [
        "settings",
        JSON.stringify({
          state: { dlLimit: 500, ulLimit: 100, language: "en" },
          version: 14,
        }),
      ],
    ]);
    const { store } = setup(backing);
    expect(store.atoms.limits.get()).toEqual({ download: 500, upload: 100 });
    expect(store.atoms.language.get()).toBe("en");
  });

  it("disables the persisted day-night theme schedule once", () => {
    const backing = new Map<string, string>([
      [
        "settings",
        JSON.stringify({
          state: {
            themeSchedule: {
              enabled: true,
              dayStart: "08:00",
              nightStart: "23:00",
              dayTheme: "win95",
              nightTheme: "tokyo-night",
            },
          },
          version: 38,
        }),
      ],
    ]);
    const { store } = setup(backing);
    expect(store.atoms.themeSchedule.get()).toEqual({
      enabled: false,
      dayStart: "08:00",
      nightStart: "23:00",
      dayTheme: "win95",
      nightTheme: "tokyo-night",
    });
  });

  it("ignores the legacy key once the new envelope exists", () => {
    const backing = new Map<string, string>([
      ["settings", JSON.stringify({ state: { pageSize: 10 }, version: 37 })],
      [
        "iluha.v1.settings",
        JSON.stringify({
          f: 1,
          store: "settings",
          sv: 37,
          ts: 1,
          data: { pageSize: 99 },
        }),
      ],
    ]);
    const { store } = setup(backing);
    expect(store.atoms.pageSize.get()).toBe(99);
  });
});

describe("settings signal persist envelope", () => {
  it("writes format A after patch plus flush", () => {
    const { store, backing } = setup();
    store.patch({ resultsPerPage: 33 });
    store.persistor.flush();
    const raw = backing.get("iluha.v1.settings") ?? "";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed.f).toBe(1);
    expect(parsed.store).toBe("settings");
    expect(parsed.sv).toBe(SETTINGS_SCHEMA_VERSION);
    expect(typeof parsed.ts).toBe("number");
    expect((parsed.data as { resultsPerPage: number }).resultsPerPage).toBe(33);
  });
});

describe("settings signal AnimeLib connection", () => {
  it("keeps the proxy through a persisted reload", () => {
    const { store, backing } = setup();
    store.patch({ animelibProxyUrl: "socks5://127.0.0.1:10808" });
    store.persistor.flush();

    const reloaded = createSettingsSignalStore({ getStorage: () => memoryStorage(backing) });

    expect(reloaded.atoms.animelibProxyUrl.get()).toBe("socks5://127.0.0.1:10808");
  });
});

describe("settings signal actions", () => {
  it("hides folders once, case-insensitively, and unhides them", () => {
    const { store } = setup();
    const svc = new PlayerVisibilityService(store.atoms);
    svc.hidePlayerFolder("C:\\Media");
    svc.hidePlayerFolder("c:/media/");
    expect(store.atoms.hiddenPlayerFolders.get()).toEqual(["C:\\Media"]);
    svc.unhidePlayerFolder("C:/MEDIA");
    expect(store.atoms.hiddenPlayerFolders.get()).toEqual([]);
  });

  it("hides and unhides torrents by hash", () => {
    const { store } = setup();
    const svc = new PlayerVisibilityService(store.atoms);
    svc.hidePlayerTorrent("abc");
    svc.hidePlayerTorrent("abc");
    expect(store.atoms.hiddenPlayerTorrents.get()).toEqual(["abc"]);
    svc.unhidePlayerTorrent("abc");
    expect(store.atoms.hiddenPlayerTorrents.get()).toEqual([]);
  });

  it("sets and clears player folder heights", () => {
    const { store } = setup();
    const svc = new PlayerVisibilityService(store.atoms);
    svc.setPlayerFolderHeight("C:\\Media", 240);
    expect(store.atoms.playerFolderHeights.get()).toEqual({ "c:/media": 240 });
    svc.setPlayerFolderHeight("C:\\Media", null);
    expect(store.atoms.playerFolderHeights.get()).toEqual({});
  });

  it("sets and clears player torrent heights", () => {
    const { store } = setup();
    const svc = new PlayerVisibilityService(store.atoms);
    svc.setPlayerTorrentHeight("abc", 240);
    expect(store.atoms.playerTorrentHeights.get()).toEqual({ abc: 240 });
    svc.setPlayerTorrentHeight("abc", null);
    expect(store.atoms.playerTorrentHeights.get()).toEqual({});
  });

  it("applies ui preferences through patch", () => {
    const { store } = setup();
    store.patch({ retroStyle: "soft", uiDensity: "compact" });
    expect(document.documentElement.dataset.retroStyle).toBe("soft");
    expect(document.documentElement.dataset.uiDensity).toBe("compact");
    expect(store.atoms.retroStyle.get()).toBe("soft");
  });
});
