import { describe, expect, it, vi, beforeAll } from "vitest";

import { playerVisibility } from "@/lib/settings/playerVisibility.utils";

// The factory below is hoisted above the imports, so its spy has to be
// created by `vi.hoisted`; importing the shared mock here would run after the
// settings store has already requested the module.
const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
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

  it("defaults fastLaunch to false on v45 and keeps an explicit opt-out", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 44).fastLaunch).toBe(false);
    expect(settings.migrateSettingsData({ language: "en", fastLaunch: true }, 44).fastLaunch).toBe(
      true
    );
  });

  it("defaults the stream quality to 1080p and repairs an unknown label", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 57).streamDefaultQuality).toBe("1080p");
    expect(
      settings.migrateSettingsData({ language: "en", streamDefaultQuality: "2160p" }, 57)
        .streamDefaultQuality
    ).toBe("2160p");
    expect(
      settings.migrateSettingsData({ language: "en", streamDefaultQuality: "8k" }, 58)
        .streamDefaultQuality
    ).toBe("1080p");
  });

  it("defaults Discord RPC to off on v59 and keeps an explicit choice", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 58).discordRpcEnabled).toBe(false);
    expect(
      settings.migrateSettingsData({ language: "en", discordRpcEnabled: true }, 58)
        .discordRpcEnabled
    ).toBe(true);
  });

  it("migrates legacy dlLimit/ulLimit into limits.download/upload", () => {
    const result = settings.migrateSettingsData({ dlLimit: 500, ulLimit: 100, language: "en" }, 14);
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
    const repaired = settings.migrateSettingsData({ language: "en", screenshotFormat: "webp" }, 34);
    expect(repaired.screenshotFormat).toBe("png");
  });
});

describe("settings signal hidden player items", () => {
  it("persists folder visibility changes without deleting the path", () => {
    settings.patchSettings({ hiddenPlayerFolders: [] });
    playerVisibility.hidePlayerFolder("C:\\Anime\\Season 1");
    playerVisibility.hidePlayerFolder("c:/anime/season 1/");
    expect(settings.settingsAtoms.hiddenPlayerFolders.get()).toEqual(["C:\\Anime\\Season 1"]);

    playerVisibility.unhidePlayerFolder("c:/anime/season 1");
    expect(settings.settingsAtoms.hiddenPlayerFolders.get()).toEqual([]);
  });

  it("hides and unhides torrents by stable info hash", () => {
    settings.patchSettings({ hiddenPlayerTorrents: [] });
    playerVisibility.hidePlayerTorrent("ABC123");
    playerVisibility.hidePlayerTorrent("ABC123");
    expect(settings.settingsAtoms.hiddenPlayerTorrents.get()).toEqual(["ABC123"]);
    playerVisibility.unhidePlayerTorrent("ABC123");
    expect(settings.settingsAtoms.hiddenPlayerTorrents.get()).toEqual([]);
  });

  it("stores folder heights under a normalized path key", () => {
    settings.patchSettings({ playerFolderHeights: {} });
    playerVisibility.setPlayerFolderHeight("C:\\Anime\\\\Season\\", 420);
    expect(settings.settingsAtoms.playerFolderHeights.get()).toEqual({ "c:/anime/season": 420 });

    playerVisibility.setPlayerFolderHeight("c:/anime/season", 555);
    expect(settings.settingsAtoms.playerFolderHeights.get()["c:/anime/season"]).toBe(555);

    playerVisibility.setPlayerFolderHeight("C:/ANIME/SEASON", null);
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
    const result = settings.migrateSettingsData(
      { parseTitles: true, language: "en" },
      37
    ) as Record<string, unknown>;
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

describe("settings progress style", () => {
  it("defaults to blocks when missing", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 38).progressStyle).toBe("blocks");
  });

  it("keeps a valid persisted style", () => {
    const result = settings.migrateSettingsData({ progressStyle: "solid", language: "en" }, 38);
    expect(result.progressStyle).toBe("solid");
  });

  it("repairs an unknown style to the default", () => {
    const result = settings.migrateSettingsData(
      { progressStyle: "stripes", language: "en" },
      38
    ) as Record<string, unknown>;
    expect(result.progressStyle).toBe("blocks");
  });
});

describe("settings similar view", () => {
  it("defaults to the rail when missing", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 38).similarView).toBe("rail");
  });

  it("keeps a valid persisted view", () => {
    const result = settings.migrateSettingsData({ similarView: "list", language: "en" }, 38);
    expect(result.similarView).toBe("list");
  });

  it("repairs an unknown view to the default", () => {
    const result = settings.migrateSettingsData(
      { similarView: "gallery", language: "en" },
      38
    ) as Record<string, unknown>;
    expect(result.similarView).toBe("rail");
  });
});

describe("settings anime detail width", () => {
  it("defaults to the normal modal when missing", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 38).animeDetailWidth).toBe("default");
  });

  it("keeps a valid persisted width", () => {
    const result = settings.migrateSettingsData({ animeDetailWidth: "wide", language: "en" }, 38);
    expect(result.animeDetailWidth).toBe("wide");
  });

  it("repairs an unknown width to the default", () => {
    const result = settings.migrateSettingsData(
      { animeDetailWidth: "huge", language: "en" },
      38
    ) as Record<string, unknown>;
    expect(result.animeDetailWidth).toBe("default");
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

describe("dither placeholder v40 migration", () => {
  it("normalizes a persisted placeholder sentinel to null", () => {
    const result = settings.migrateSettingsData(
      { language: "en", selectedDitherId: "placeholder" },
      39
    );
    expect(result.selectedDitherId).toBe(null);
  });

  it("keeps a real wallpaper selection", () => {
    const result = settings.migrateSettingsData({ language: "en", selectedDitherId: "aaa" }, 39);
    expect(result.selectedDitherId).toBe("aaa");
  });
});

describe("sprite settings v41 migration", () => {
  it("drops the removed sprite keys and falls back to defaults", () => {
    const result = settings.migrateSettingsData(
      {
        language: "en",
        thumbPreviews: true,
        spriteBurstMpv: false,
        spriteFillPlayback: false,
        spriteNeighborCount: 5,
      },
      40
    );
    const raw = result as unknown as Record<string, unknown>;
    expect(raw.thumbPreviews).toBeUndefined();
    expect(raw.spriteBurstMpv).toBeUndefined();
    expect(raw.spriteFillPlayback).toBeUndefined();
    expect(raw.spriteNeighborCount).toBeUndefined();
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

describe("torrent cover mode preference", () => {
  it("defaults to hidden without a manual choice", async () => {
    const { DEFAULT_SETTINGS } = await import("@/config/settings/defaults.config");

    expect(DEFAULT_SETTINGS.torrentCoverMode).toBe("off");
    expect(DEFAULT_SETTINGS.torrentCoverModeManual).toBe(false);
  });

  it("round-trips through the settings store", () => {
    settings.patchSettings({ torrentCoverMode: "full", torrentCoverModeManual: true });

    expect(settings.settingsAtoms.torrentCoverMode.get()).toBe("full");
    expect(settings.settingsAtoms.torrentCoverModeManual.get()).toBe(true);

    settings.patchSettings({ torrentCoverMode: "off", torrentCoverModeManual: false });
  });

  it("migrates a legacy enabled flag into a manual full mode", () => {
    const result = settings.migrateSettingsData({ language: "en", torrentCoversEnabled: true }, 43);
    expect(result.torrentCoverMode).toBe("full");
    expect(result.torrentCoverModeManual).toBe(true);
    expect("torrentCoversEnabled" in result).toBe(false);
  });

  it("migrates a legacy disabled flag into the automatic off mode", () => {
    const result = settings.migrateSettingsData(
      { language: "en", torrentCoversEnabled: false },
      43
    );
    expect(result.torrentCoverMode).toBe("off");
    expect(result.torrentCoverModeManual).toBe(false);
  });

  it("repairs an unknown persisted mode to the default", () => {
    const result = settings.migrateSettingsData({ language: "en", torrentCoverMode: "bogus" }, 44);
    expect(result.torrentCoverMode).toBe("off");
  });
});

describe("torrent cover mode anilist sync", () => {
  it("enables full covers on login when the user never chose", () => {
    settings.patchSettings({ torrentCoverMode: "off", torrentCoverModeManual: false });

    settings.syncCoverModeWithAnilistAuth(true);

    expect(settings.settingsAtoms.torrentCoverMode.get()).toBe("full");
  });

  it("restores off on logout when the user never chose", () => {
    settings.patchSettings({ torrentCoverMode: "full", torrentCoverModeManual: false });

    settings.syncCoverModeWithAnilistAuth(false);

    expect(settings.settingsAtoms.torrentCoverMode.get()).toBe("off");
  });

  it("keeps a manual choice on auth changes", () => {
    settings.patchSettings({ torrentCoverMode: "pages", torrentCoverModeManual: true });

    settings.syncCoverModeWithAnilistAuth(true);
    settings.syncCoverModeWithAnilistAuth(false);

    expect(settings.settingsAtoms.torrentCoverMode.get()).toBe("pages");

    settings.patchSettings({ torrentCoverMode: "off", torrentCoverModeManual: false });
  });
});

describe("vim keyboard mode preference", () => {
  it("defaults to off", async () => {
    const { DEFAULT_SETTINGS } = await import("@/config/settings/defaults.config");
    expect(DEFAULT_SETTINGS.vimMode).toBe(false);
  });

  it("fills the default for persisted state without the flag", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 45).vimMode).toBe(false);
  });

  it("keeps an explicit opt-in through the v46 boundary", () => {
    expect(settings.migrateSettingsData({ language: "en", vimMode: true }, 45).vimMode).toBe(true);
  });

  it("round-trips through the settings store", () => {
    settings.patchSettings({ vimMode: true });
    expect(settings.settingsAtoms.vimMode.get()).toBe(true);

    settings.patchSettings({ vimMode: false });
    expect(settings.settingsAtoms.vimMode.get()).toBe(false);
  });
});

describe("webview proxy preference", () => {
  it("defaults to enabled", async () => {
    const { DEFAULT_SETTINGS } = await import("@/config/settings/defaults.config");

    expect(DEFAULT_SETTINGS.webviewProxyEnabled).toBe(true);
  });

  it("fills the default for persisted state without the flag", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 41).webviewProxyEnabled).toBe(true);
  });

  it("keeps an explicit opt-out", () => {
    const result = settings.migrateSettingsData({ language: "en", webviewProxyEnabled: false }, 41);
    expect(result.webviewProxyEnabled).toBe(false);
  });
});

describe("notification popup mode v51 migration", () => {
  it("maps a legacy enabled flag to both channels", () => {
    const result = settings.migrateSettingsData(
      { language: "en", notificationsEnabled: true },
      50
    ) as Record<string, unknown>;
    expect(result.notificationPopups).toBe("both");
    expect("notificationsEnabled" in result).toBe(false);
  });

  it("maps a legacy disabled flag to off", () => {
    const result = settings.migrateSettingsData(
      { language: "en", notificationsEnabled: false },
      50
    ) as Record<string, unknown>;
    expect(result.notificationPopups).toBe("off");
    expect("notificationsEnabled" in result).toBe(false);
  });

  it("defaults to off when no legacy flag exists", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 50).notificationPopups).toBe("off");
  });

  it("keeps an explicit popup mode", () => {
    expect(
      settings.migrateSettingsData({ language: "en", notificationPopups: "inapp" }, 50)
        .notificationPopups
    ).toBe("inapp");
  });

  it("repairs an unknown popup mode to the default", () => {
    const result = settings.migrateSettingsData(
      { language: "en", notificationPopups: "bogus" },
      50
    );
    expect(result.notificationPopups).toBe("off");
  });

  it("round-trips through the settings store", () => {
    settings.patchSettings({ notificationPopups: "system" });
    expect(settings.settingsAtoms.notificationPopups.get()).toBe("system");
    settings.patchSettings({ notificationPopups: "both" });
    expect(settings.settingsAtoms.notificationPopups.get()).toBe("both");
  });
});

describe("secret game tab v52 migration", () => {
  it("keeps the game tab locked on older state", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 51).gameTabUnlocked).toBe(false);
  });

  it("keeps an unlocked game tab", () => {
    expect(
      settings.migrateSettingsData({ language: "en", gameTabUnlocked: true }, 51).gameTabUnlocked
    ).toBe(true);
  });

  it("rejects a non-boolean flag", () => {
    expect(
      settings.migrateSettingsData({ language: "en", gameTabUnlocked: "yes" }, 51).gameTabUnlocked
    ).toBe(false);
  });

  it("round-trips through the settings store", () => {
    settings.patchSettings({ gameTabUnlocked: true });
    expect(settings.settingsAtoms.gameTabUnlocked.get()).toBe(true);
    settings.patchSettings({ gameTabUnlocked: false });
    expect(settings.settingsAtoms.gameTabUnlocked.get()).toBe(false);
  });
});

describe("game volume v53 migration", () => {
  it("defaults the volume to full loudness on older state", () => {
    expect(settings.migrateSettingsData({ language: "en" }, 52).gameVolume).toBe(1);
  });

  it("keeps a stored volume", () => {
    expect(settings.migrateSettingsData({ language: "en", gameVolume: 0.3 }, 52).gameVolume).toBe(
      0.3
    );
  });

  it("rejects an out-of-range volume", () => {
    expect(settings.migrateSettingsData({ language: "en", gameVolume: 4 }, 52).gameVolume).toBe(1);
  });

  it("round-trips through the settings store", () => {
    settings.patchSettings({ gameVolume: 0.25 });
    expect(settings.settingsAtoms.gameVolume.get()).toBe(0.25);
    settings.patchSettings({ gameVolume: 1 });
    expect(settings.settingsAtoms.gameVolume.get()).toBe(1);
  });
});

describe("update toggle removal v54 migration", () => {
  it("drops the dead update toggle and keeps the rest", () => {
    const result = settings.migrateSettingsData(
      { language: "en", notifyUpdateAvailable: false, notifyScanErrors: false },
      54
    );
    expect("notifyUpdateAvailable" in result).toBe(false);
    expect(result.notifyScanErrors).toBe(false);
  });
});

describe("search source order v43 migration", () => {
  it("lists rutracker, nekobt, erai-raws first", async () => {
    const { SOURCE_INFOS } = await import("@/config/search/sources.config");
    expect(SOURCE_INFOS.map((info) => info.value)).toEqual([
      "rutracker",
      "nekobt",
      "erai-raws",
      "nyaa",
      "sukebei",
    ]);
  });

  it("defaults to rutracker first", async () => {
    const { DEFAULT_SETTINGS } = await import("@/config/settings/defaults.config");
    expect(DEFAULT_SETTINGS.defaultSearchSource).toBe("rutracker");
    expect(DEFAULT_SETTINGS.visibleSources).toEqual(["rutracker", "nekobt", "erai-raws", "nyaa"]);
  });

  it("reorders stored sources and moves the legacy default to rutracker", () => {
    const result = settings.migrateSettingsData(
      {
        language: "en",
        visibleSources: ["erai-raws", "rutracker", "nyaa", "nekobt"],
        defaultSearchSource: "erai-raws",
      },
      42
    );
    expect(result.visibleSources).toEqual(["rutracker", "nekobt", "erai-raws", "nyaa"]);
    expect(result.defaultSearchSource).toBe("rutracker");
  });

  it("keeps visibility choices and unknown sources at the end", () => {
    const result = settings.migrateSettingsData(
      {
        language: "en",
        visibleSources: ["sukebei", "nyaa", "custom"],
        defaultSearchSource: "nyaa",
      },
      42
    );
    expect(result.visibleSources).toEqual(["nyaa", "sukebei", "custom"]);
    expect(result.defaultSearchSource).toBe("nyaa");
  });

  it("leaves already migrated state untouched", () => {
    const result = settings.migrateSettingsData(
      {
        language: "en",
        visibleSources: ["rutracker", "erai-raws"],
        defaultSearchSource: "erai-raws",
      },
      43
    );
    expect(result.visibleSources).toEqual(["rutracker", "erai-raws"]);
    expect(result.defaultSearchSource).toBe("erai-raws");
  });
});

describe("settings shape removals", () => {
  it("drops a key the current shape no longer has", () => {
    const result = settings.migrateSettingsData(
      { language: "en", notifySequel: false, notifyNewFiles: true },
      53
    ) as Record<string, unknown>;
    expect(result.notifyNewFiles).toBeUndefined();
    expect(result.notifySequel).toBe(false);
  });
});
