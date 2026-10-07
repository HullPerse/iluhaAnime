import { describe, expect, it, vi, beforeAll } from "vitest";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

let settings: typeof import("@/store/settings.store");

beforeAll(async () => {
  settings = await import("@/store/settings.store");
});

describe("settings signal migration", () => {
  it("keeps the persisted English locale", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 1).language).toBe("en");
  });

  it("keeps the persisted Russian locale", () => {
    expect(settings.migrateSettingsData({ language: "ru" }, 1).language).toBe("ru");
  });

  it("normalizes unknown locales to Russian", () => {
    expect(settings.migrateSettingsData({ language: "fr" }, 1).language).toBe("ru");
  });

  it("preserves other persisted fields", () => {
    const result = settings.migrateSettingsData({ language: "en", pageSize: 10 }, 1);
    expect(result.language).toBe("en");
    expect(result.pageSize).toBe(10);
  });

  it("migrates legacy dlLimit/ulLimit into limits.download/upload", () => {
    const result = settings.migrateSettingsData(
      { dlLimit: 500, ulLimit: 100, language: "en" },
      14
    );
    expect(result.language).toBe("en");
    expect(result.limits).toEqual({ download: 500, upload: 100 });
    expect("dlLimit" in result).toBe(false);
    expect("ulLimit" in result).toBe(false);
  });

  it("returns an empty object for non-object state", () => {
    expect(settings.migrateSettingsData(null, 1)).toEqual({});
  });

  it("reshapes legacy shadows and defaults the wallpaper shadow on v20", () => {
    const off = { top: false, right: false, bottom: false, left: false };
    const result = settings.migrateSettingsData({ language: "en" }, 18);
    expect(result.searchShadow).toEqual({
      sides: off,
      intensity: 50,
      color: "#000000",
      length: 8,
      softness: 40,
    });
    expect(result.wallpaperShadow).toEqual({
      sides: off,
      intensity: 50,
      color: "#000000",
      length: 8,
      softness: 40,
    });
    expect(result.wallpaperFilters.brightness).toBe(75);
  });

  it("converts stored single-side shadows on v20", () => {
    const top = settings.migrateSettingsData(
      {
        language: "en",
        wallpaperShadow: { side: "top", intensity: 80, color: "#ff0000" },
      },
      18
    );
    expect(top.searchShadow).toEqual({
      sides: { top: true, right: false, bottom: false, left: false },
      intensity: 80,
      color: "#ff0000",
      length: 8,
      softness: 40,
    });
    const around = settings.migrateSettingsData(
      {
        language: "en",
        wallpaperShadow: { side: "around", intensity: 30, color: "#112233" },
      },
      18
    );
    expect(around.searchShadow.sides).toEqual({
      top: true,
      right: true,
      bottom: true,
      left: true,
    });
  });

  it("keeps a stored screenshot folder and repairs an unknown format", () => {
    const kept = settings.migrateSettingsData(
      {
        language: "en",
        screenshotDir: "D:\\Shots",
        screenshotFormat: "jpeg",
        screenshotOpenFolder: false,
      },
      34
    );
    expect(kept.screenshotDir).toBe("D:\\Shots");
    expect(kept.screenshotFormat).toBe("jpeg");
    expect(kept.screenshotOpenFolder).toBe(false);
    const repaired = settings.migrateSettingsData(
      { language: "en", screenshotFormat: "webp" },
      34
    );
    expect(repaired.screenshotFormat).toBe("png");
  });
});

describe("settings signal hidden player items", () => {
  it("persists folder visibility changes without deleting the path", () => {
    settings.patchSettings({ hiddenPlayerFolders: [] });
    settings.hidePlayerFolder("C:\\Anime\\Season 1");
    settings.hidePlayerFolder("c:/anime/season 1/");
    expect(settings.settingsAtoms.hiddenPlayerFolders.get()).toEqual(["C:\\Anime\\Season 1"]);

    settings.unhidePlayerFolder("c:/anime/season 1");
    expect(settings.settingsAtoms.hiddenPlayerFolders.get()).toEqual([]);
  });

  it("hides and unhides torrents by stable info hash", () => {
    settings.patchSettings({ hiddenPlayerTorrents: [] });
    settings.hidePlayerTorrent("ABC123");
    settings.hidePlayerTorrent("ABC123");
    expect(settings.settingsAtoms.hiddenPlayerTorrents.get()).toEqual(["ABC123"]);
    settings.unhidePlayerTorrent("ABC123");
    expect(settings.settingsAtoms.hiddenPlayerTorrents.get()).toEqual([]);
  });

  it("stores folder heights under a normalized path key", () => {
    settings.patchSettings({ playerFolderHeights: {} });
    settings.setPlayerFolderHeight("C:\\Anime\\\\Season\\", 420);
    expect(settings.settingsAtoms.playerFolderHeights.get()).toEqual({ "c:/anime/season": 420 });

    settings.setPlayerFolderHeight("c:/anime/season", 555);
    expect(settings.settingsAtoms.playerFolderHeights.get()["c:/anime/season"]).toBe(555);

    settings.setPlayerFolderHeight("C:/ANIME/SEASON", null);
    expect(settings.settingsAtoms.playerFolderHeights.get()).toEqual({});
  });
});

describe("settings signal autocomplete", () => {
  it("migrates legacy disabled autocomplete to the off mode", () => {
    const result = settings.migrateSettingsData(
      {
        autocompleteMode: "inline",
        inlineAutocompleteEnabled: false,
        language: "en",
      },
      2
    ) as Record<string, unknown>;
    expect(result.autocompleteMode).toBe("off");
    expect(result.language).toBe("en");
    expect("inlineAutocompleteEnabled" in result).toBe(false);
  });
});

describe("settings title toggles v38 migration", () => {
  it("moves legacy parseTitles into parseTitlesPlayer", () => {
    const result = settings.migrateSettingsData({ parseTitles: true, language: "en" }, 37) as Record<
      string,
      unknown
    >;
    expect(result.parseTitlesPlayer).toBe(true);
    expect(result.parseTitlesTorrent).toBe(false);
    expect(result.parseTitlesSearch).toBe(false);
    expect("parseTitles" in result).toBe(false);
  });

  it("keeps explicit per-surface toggles", () => {
    const result = settings.migrateSettingsData(
      { parseTitles: true, parseTitlesTorrent: true, language: "en" },
      37
    ) as Record<string, unknown>;
    expect(result.parseTitlesPlayer).toBe(true);
    expect(result.parseTitlesTorrent).toBe(true);
  });
});

describe("settings signal patch", () => {
  it("applies partial updates", () => {
    settings.patchSettings({ limits: { download: null, upload: null }, language: "ru" });
    settings.patchSettings({ limits: { download: 200, upload: null } });
    expect(settings.settingsAtoms.limits.get().download).toBe(200);
    expect(settings.settingsAtoms.language.get()).toBe("ru");
  });
});

describe("wallpaper effect settings v25 migration", () => {
  it("drops the removed parallax flag and defaults scanlines off", () => {
    const result = settings.migrateSettingsData(
      {
        language: "en",
        wallpaperParallax: true,
        wallpaperScanlines: undefined,
      },
      24
    );
    expect((result as Record<string, unknown>).wallpaperParallax).toBeUndefined();
    expect(result.wallpaperScanlines).toBe(false);
  });
});

describe("anilist list sort v26 migration", () => {
  it("keeps a valid persisted list sort", () => {
    const result = settings.migrateSettingsData(
      { language: "en", anilistListSort: { key: "progress", dir: "desc" } },
      25
    );
    expect(result.anilistListSort).toEqual({ key: "progress", dir: "desc" });
  });

  it("coerces an unknown sort key or direction to the default", () => {
    const badKey = settings.migrateSettingsData(
      { language: "en", anilistListSort: { key: "nope", dir: "desc" } },
      25
    );
    expect(badKey.anilistListSort).toEqual({ key: "title", dir: "asc" });
    const badDir = settings.migrateSettingsData(
      { language: "en", anilistListSort: { key: "title", dir: "sideways" } },
      25
    );
    expect(badDir.anilistListSort).toEqual({ key: "title", dir: "asc" });
  });
});

describe("window chrome side effect", () => {
  it("pushes native decorations when the custom title bar is turned off", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({ customTitleBarEnabled: true, roundedWindowCorners: false });

    settings.patchSettings({ customTitleBarEnabled: false });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: true,
      effect: "none",
      roundedCorners: false,
    });
  });

  it("carries the current corner preference alongside the title bar change", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({ customTitleBarEnabled: true, roundedWindowCorners: true });

    settings.patchSettings({ customTitleBarEnabled: false });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: true,
      effect: "none",
      roundedCorners: true,
    });
  });

  it("pushes rounded corners on their own", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({ customTitleBarEnabled: true, roundedWindowCorners: false });

    settings.patchSettings({ roundedWindowCorners: true });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: false,
      effect: "none",
      roundedCorners: true,
    });
  });

  it("pushes the window effect on its own and paints it on the document", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({
      customTitleBarEnabled: true,
      roundedWindowCorners: true,
      windowEffect: "none",
    });

    settings.patchSettings({ windowEffect: "acrylic" });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: false,
      effect: "acrylic",
      roundedCorners: true,
    });
    expect(document.documentElement.dataset.windowEffect).toBe("acrylic");
  });

  it("clears the material and the document flag when the effect is turned off", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({
      customTitleBarEnabled: true,
      roundedWindowCorners: false,
      windowEffect: "mica",
    });

    settings.patchSettings({ windowEffect: "none" });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: false,
      effect: "none",
      roundedCorners: false,
    });
    expect(document.documentElement.dataset.windowEffect).toBe("none");
  });

  it("publishes the tint override and hands control back on reset", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({ windowTintOpacity: null });

    settings.patchSettings({ windowTintOpacity: 0.6 });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("60%");

    settings.patchSettings({ windowTintOpacity: null });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("");
  });

  it("clamps a tint override to a usable range", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);

    settings.patchSettings({ windowTintOpacity: 4 });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("100%");

    settings.patchSettings({ windowTintOpacity: -1 });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("0%");
  });

  it("does not call the command for unrelated settings", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);

    settings.patchSettings({ pageSize: 42 });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("pushes the rehydrated custom title bar to the backend on startup", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({
      customTitleBarEnabled: true,
      roundedWindowCorners: true,
      windowEffect: "mica",
    });
    settings.rehydrateSettings();

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: false,
      effect: "mica",
      roundedCorners: true,
    });
  });

  it("pushes native decorations when rehydrating without the custom title bar", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    settings.patchSettings({
      customTitleBarEnabled: false,
      roundedWindowCorners: false,
      windowEffect: "none",
    });
    settings.rehydrateSettings();

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: true,
      effect: "none",
      roundedCorners: false,
    });
  });
});

describe("yorha grid v29 migration", () => {
  it("mirrors the grid flag to the document", () => {
    settings.patchSettings({ yorhaScanlinesEnabled: false });
    expect(document.documentElement.dataset.yorhaScanlines).toBe("off");
    settings.patchSettings({ yorhaScanlinesEnabled: true });
    expect(document.documentElement.dataset.yorhaScanlines).toBe("on");
  });
});

describe("anilist title language preference", () => {
  it("defaults to the AniList account value", async () => {
    const { DEFAULT_SETTINGS } = await import("@/config/settings/defaults.config");

    expect(DEFAULT_SETTINGS.anilistTitleLanguage).toBe("account");
  });

  it("round-trips through the settings store", () => {
    settings.patchSettings({ anilistTitleLanguage: "account" });
    settings.patchSettings({ anilistTitleLanguage: "native" });

    expect(settings.settingsAtoms.anilistTitleLanguage.get()).toBe("native");

    settings.patchSettings({ anilistTitleLanguage: "account" });
  });
});

describe("anilist adult content preference", () => {
  it("defaults to excluding adult titles", async () => {
    const { DEFAULT_SETTINGS } = await import("@/config/settings/defaults.config");

    expect(DEFAULT_SETTINGS.anilistAdultContent).toBe(false);
  });

  it("round-trips through the settings store", () => {
    settings.patchSettings({ anilistAdultContent: true });

    expect(settings.settingsAtoms.anilistAdultContent.get()).toBe(true);

    settings.patchSettings({ anilistAdultContent: false });
  });
});
