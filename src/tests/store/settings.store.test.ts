import { describe, expect, it, vi, beforeAll } from "vitest";

const storage = new Map<string, string>();

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

let useSettingsStore: (typeof import("@/store/settings.store"))["useSettingsStore"];

beforeAll(async () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      removeItem: (k: string) => storage.delete(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  const mod = await import("@/store/settings.store");
  useSettingsStore = mod.useSettingsStore;
});

describe("useSettingsStore migration", () => {
  it("keeps the persisted English locale", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 1) as {
      language: string;
    };
    expect(result.language).toBe("en");
  });

  it("keeps the persisted Russian locale", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "ru" } as never, 1) as {
      language: string;
    };
    expect(result.language).toBe("ru");
  });

  it("normalizes unknown locales to Russian", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "fr" } as never, 1) as {
      language: string;
    };
    expect(result.language).toBe("ru");
  });

  it("preserves other persisted fields", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en", pageSize: 10 } as never, 1) as {
      language: string;
      pageSize: number;
    };
    expect(result.language).toBe("en");
    expect(result.pageSize).toBe(10);
  });

  it("migrates legacy dlLimit/ulLimit into limits.download/upload", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ dlLimit: 500, ulLimit: 100, language: "en" } as never, 14) as {
      limits: { download: number | null; upload: number | null };
      language: string;
    };
    expect(result.language).toBe("en");
    expect(result.limits).toEqual({ download: 500, upload: 100 });
    expect("dlLimit" in result).toBe(false);
    expect("ulLimit" in result).toBe(false);
  });

  it("returns an empty object for non-object state", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    expect(migrate!(null, 1)).toEqual({});
  });

  it("fills default tag tolerances during v24 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 23) as {
      tagTolerances: Record<string, number>;
    };
    expect(result.tagTolerances).toEqual({ episodes: 2, progress: 5, rating: 1, year: 2 });
  });

  it("keeps customized tolerances during v24 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en", tagTolerances: { year: 5 } } as never, 23) as {
      tagTolerances: Record<string, number>;
    };
    expect(result.tagTolerances.year).toBe(5);
    expect(result.tagTolerances.rating).toBe(1);
  });
  it("defaults playerFolderHeights during v16 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 15) as {
      playerFolderHeights: Record<string, number>;
    };
    expect(result.playerFolderHeights).toEqual({});
  });

  it("keeps persisted playerFolderHeights on v16 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const heights = { "c:/anime": 420 };
    const result = migrate!({ language: "en", playerFolderHeights: heights } as never, 15) as {
      playerFolderHeights: Record<string, number>;
    };
    expect(result.playerFolderHeights).toEqual(heights);
  });

  it("defaults anilistProxyUrl during v21 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 20) as {
      anilistProxyUrl: string | null;
    };
    expect(result.anilistProxyUrl).toBeNull();
  });

  it("keeps persisted anilistProxyUrl on v21 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!(
      { language: "en", anilistProxyUrl: "http://127.0.0.1:7890" } as never,
      20
    ) as {
      anilistProxyUrl: string | null;
    };
    expect(result.anilistProxyUrl).toBe("http://127.0.0.1:7890");
  });

  it("defaults selectedDitherId during v18 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 17) as {
      selectedDitherId: string | null;
    };
    expect(result.selectedDitherId).toBeNull();
  });

  it("keeps persisted selectedDitherId on v18 migration", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en", selectedDitherId: "aaa" } as never, 17) as {
      selectedDitherId: string | null;
    };
    expect(result.selectedDitherId).toBe("aaa");
  });

  it("reshapes legacy shadows and defaults the wallpaper shadow on v20", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const off = { top: false, right: false, bottom: false, left: false };
    const result = migrate!({ language: "en" } as never, 18) as {
      searchShadow?: { sides: typeof off; intensity: number; color: string };
      wallpaperShadow?: { sides: typeof off; intensity: number; color: string };
      wallpaperFilters?: { brightness: number };
    };
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
    expect(result.wallpaperFilters?.brightness).toBe(75);
  });

  it("converts stored single-side shadows on v20", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const top = migrate!(
      {
        language: "en",
        wallpaperShadow: { side: "top", intensity: 80, color: "#ff0000" },
      } as never,
      18
    ) as { searchShadow?: { sides: Record<string, boolean>; intensity: number; color: string } };
    expect(top.searchShadow).toEqual({
      sides: { top: true, right: false, bottom: false, left: false },
      intensity: 80,
      color: "#ff0000",
      length: 8,
      softness: 40,
    });
    const around = migrate!(
      {
        language: "en",
        wallpaperShadow: { side: "around", intensity: 30, color: "#112233" },
      } as never,
      18
    ) as { searchShadow?: { sides: Record<string, boolean> } };
    expect(around.searchShadow?.sides).toEqual({
      top: true,
      right: true,
      bottom: true,
      left: true,
    });
  });
});

describe("useSettingsStore hidden player items", () => {
  it("persists folder visibility changes without deleting the path", () => {
    useSettingsStore.setState({ hiddenPlayerFolders: [] });
    useSettingsStore.getState().hidePlayerFolder("C:\\Anime\\Season 1");
    useSettingsStore.getState().hidePlayerFolder("c:/anime/season 1/");
    expect(useSettingsStore.getState().hiddenPlayerFolders).toEqual(["C:\\Anime\\Season 1"]);

    useSettingsStore.getState().unhidePlayerFolder("c:/anime/season 1");
    expect(useSettingsStore.getState().hiddenPlayerFolders).toEqual([]);
  });

  it("hides and unhides torrents by stable info hash", () => {
    useSettingsStore.setState({ hiddenPlayerTorrents: [] });
    useSettingsStore.getState().hidePlayerTorrent("ABC123");
    useSettingsStore.getState().hidePlayerTorrent("ABC123");
    expect(useSettingsStore.getState().hiddenPlayerTorrents).toEqual(["ABC123"]);
    useSettingsStore.getState().unhidePlayerTorrent("ABC123");
    expect(useSettingsStore.getState().hiddenPlayerTorrents).toEqual([]);
  });

  it("stores folder heights under a normalized path key", () => {
    useSettingsStore.setState({ playerFolderHeights: {} });
    useSettingsStore.getState().setPlayerFolderHeight("C:\\Anime\\\\Season\\", 420);
    expect(useSettingsStore.getState().playerFolderHeights).toEqual({ "c:/anime/season": 420 });

    useSettingsStore.getState().setPlayerFolderHeight("c:/anime/season", 555);
    expect(useSettingsStore.getState().playerFolderHeights["c:/anime/season"]).toBe(555);

    useSettingsStore.getState().setPlayerFolderHeight("C:/ANIME/SEASON", null);
    expect(useSettingsStore.getState().playerFolderHeights).toEqual({});
  });
});

describe("useSettingsStore autocomplete", () => {
  it("defaults to both-mode autocomplete with subtle AniList boost", () => {
    expect(useSettingsStore.getState().autocompleteMode).toBe("both");
    expect(useSettingsStore.getState().anilistSuggestionBoost).toBe("subtle");
  });

  it("migrates legacy disabled autocomplete to the off mode", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!(
      {
        autocompleteMode: "inline",
        inlineAutocompleteEnabled: false,
        language: "en",
      } as never,
      2
    ) as Record<string, unknown>;
    expect(result.autocompleteMode).toBe("off");
    expect(result.language).toBe("en");
    expect("inlineAutocompleteEnabled" in result).toBe(false);
  });
});

describe("useSettingsStore patch", () => {
  it("applies partial updates", () => {
    useSettingsStore.setState({ limits: { download: null, upload: null }, language: "ru" });
    useSettingsStore.getState().patch({ limits: { download: 200, upload: null } });
    const s = useSettingsStore.getState();
    expect(s.limits.download).toBe(200);
    expect(s.language).toBe("ru");
  });
});

describe("wallpaper effect settings v25 migration", () => {
  it("drops the removed parallax flag and defaults scanlines off", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!(
      {
        language: "en",
        wallpaperParallax: true,
        wallpaperScanlines: undefined,
      } as never,
      24
    ) as { wallpaperParallax?: boolean; wallpaperScanlines: boolean };
    expect(result.wallpaperParallax).toBeUndefined();
    expect(result.wallpaperScanlines).toBe(false);
  });

  it("keeps persisted scanlines", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!(
      {
        language: "en",
        wallpaperScanlines: true,
      } as never,
      24
    ) as { wallpaperScanlines: boolean };
    expect(result.wallpaperScanlines).toBe(true);
  });
});

describe("anilist list sort v26 migration", () => {
  it("defaults the list sort to titles ascending", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 25) as {
      anilistListSort: { key: string; dir: string };
    };
    expect(result.anilistListSort).toEqual({ key: "title", dir: "asc" });
  });

  it("keeps a valid persisted list sort", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!(
      { language: "en", anilistListSort: { key: "progress", dir: "desc" } } as never,
      25
    ) as { anilistListSort: { key: string; dir: string } };
    expect(result.anilistListSort).toEqual({ key: "progress", dir: "desc" });
  });

  it("coerces an unknown sort key or direction to the default", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const badKey = migrate!(
      { language: "en", anilistListSort: { key: "nope", dir: "desc" } } as never,
      25
    ) as {
      anilistListSort: { key: string; dir: string };
    };
    expect(badKey.anilistListSort).toEqual({ key: "title", dir: "asc" });
    const badDir = migrate!(
      { language: "en", anilistListSort: { key: "title", dir: "sideways" } } as never,
      25
    ) as {
      anilistListSort: { key: string; dir: string };
    };
    expect(badDir.anilistListSort).toEqual({ key: "title", dir: "asc" });
  });
});

type WindowToggleMigration = {
  customTitleBarEnabled: boolean;
  statusBarEnabled: boolean;
  roundedWindowCorners: boolean;
  searchMascotEnabled: boolean;
};

describe("experimental toggles v28 migration", () => {
  it("defaults all four toggles", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 27) as WindowToggleMigration;
    expect(result.customTitleBarEnabled).toBe(false);
    expect(result.statusBarEnabled).toBe(true);
    expect(result.roundedWindowCorners).toBe(false);
    expect(result.searchMascotEnabled).toBe(false);
  });

  it("keeps persisted toggle values", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!(
      {
        language: "en",
        customTitleBarEnabled: false,
        statusBarEnabled: false,
        roundedWindowCorners: true,
        searchMascotEnabled: true,
      } as never,
      27
    ) as WindowToggleMigration;
    expect(result.customTitleBarEnabled).toBe(false);
    expect(result.statusBarEnabled).toBe(false);
    expect(result.roundedWindowCorners).toBe(true);
    expect(result.searchMascotEnabled).toBe(true);
  });

  it("matches the Rust chrome default: native frame, square corners", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 27) as WindowToggleMigration;
    expect(result.customTitleBarEnabled).toBe(false);
    expect(result.roundedWindowCorners).toBe(false);
  });
});

type WindowEffectMigration = { windowEffect: string };

type WindowTintMigration = { windowTintOpacity: number | null };

describe("window effect v30 migration", () => {
  it("defaults to no window effect, matching the Rust chrome default", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 29) as WindowEffectMigration;
    expect(result.windowEffect).toBe("none");
  });

  it("keeps a persisted window effect", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en", windowEffect: "mica" } as never, 29) as
      | WindowEffectMigration
      | undefined;
    expect(result?.windowEffect).toBe("mica");
  });
});

describe("window tint v31 migration", () => {
  it("starts on the theme's own readable value", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 30) as WindowTintMigration;
    expect(result.windowTintOpacity).toBeNull();
  });

  it("keeps a persisted override", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en", windowTintOpacity: 0.6 } as never, 30) as
      | WindowTintMigration
      | undefined;
    expect(result?.windowTintOpacity).toBe(0.6);
  });
});

describe("window chrome side effect", () => {
  it("pushes native decorations when the custom title bar is turned off", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useSettingsStore.setState({ customTitleBarEnabled: true, roundedWindowCorners: false });

    useSettingsStore.getState().patch({ customTitleBarEnabled: false });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: true,
      effect: "none",
      roundedCorners: false,
    });
  });

  it("carries the current corner preference alongside the title bar change", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useSettingsStore.setState({ customTitleBarEnabled: true, roundedWindowCorners: true });

    useSettingsStore.getState().patch({ customTitleBarEnabled: false });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: true,
      effect: "none",
      roundedCorners: true,
    });
  });

  it("pushes rounded corners on their own", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useSettingsStore.setState({ customTitleBarEnabled: true, roundedWindowCorners: false });

    useSettingsStore.getState().patch({ roundedWindowCorners: true });

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: false,
      effect: "none",
      roundedCorners: true,
    });
  });

  it("pushes the window effect on its own and paints it on the document", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useSettingsStore.setState({
      customTitleBarEnabled: true,
      roundedWindowCorners: true,
      windowEffect: "none",
    });

    useSettingsStore.getState().patch({ windowEffect: "acrylic" });

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
    useSettingsStore.setState({
      customTitleBarEnabled: true,
      roundedWindowCorners: false,
      windowEffect: "mica",
    });

    useSettingsStore.getState().patch({ windowEffect: "none" });

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
    useSettingsStore.setState({ windowTintOpacity: null });

    useSettingsStore.getState().patch({ windowTintOpacity: 0.6 });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("60%");

    useSettingsStore.getState().patch({ windowTintOpacity: null });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("");
  });

  it("clamps a tint override to a usable range", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);

    useSettingsStore.getState().patch({ windowTintOpacity: 4 });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("100%");

    useSettingsStore.getState().patch({ windowTintOpacity: -1 });
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("0%");
  });

  it("does not call the command for unrelated settings", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);

    useSettingsStore.getState().patch({ pageSize: 42 });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("pushes the rehydrated custom title bar to the backend on startup", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    const onRehydrate = useSettingsStore.persist.getOptions()?.onRehydrateStorage;
    const finish = onRehydrate?.(useSettingsStore.getState());

    finish?.(
      {
        ...useSettingsStore.getState(),
        customTitleBarEnabled: true,
        roundedWindowCorners: true,
        windowEffect: "mica",
      },
      undefined
    );

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: false,
      effect: "mica",
      roundedCorners: true,
    });
  });

  it("pushes native decorations when rehydrating without the custom title bar", () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    const onRehydrate = useSettingsStore.persist.getOptions()?.onRehydrateStorage;
    const finish = onRehydrate?.(useSettingsStore.getState());

    finish?.(
      {
        ...useSettingsStore.getState(),
        customTitleBarEnabled: false,
        roundedWindowCorners: false,
        windowEffect: "none",
      },
      undefined
    );

    expect(mockInvoke).toHaveBeenCalledWith("set_window_chrome", {
      decorations: true,
      effect: "none",
      roundedCorners: false,
    });
  });
});

describe("yorha grid v29 migration", () => {
  it("defaults the grid to on", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en" } as never, 28) as {
      yorhaScanlinesEnabled: boolean;
    };
    expect(result.yorhaScanlinesEnabled).toBe(true);
  });

  it("keeps a persisted opt-out", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    const result = migrate!({ language: "en", yorhaScanlinesEnabled: false } as never, 28) as {
      yorhaScanlinesEnabled: boolean;
    };
    expect(result.yorhaScanlinesEnabled).toBe(false);
  });

  it("mirrors the grid flag to the document", () => {
    useSettingsStore.getState().patch({ yorhaScanlinesEnabled: false });
    expect(document.documentElement.dataset.yorhaScanlines).toBe("off");
    useSettingsStore.getState().patch({ yorhaScanlinesEnabled: true });
    expect(document.documentElement.dataset.yorhaScanlines).toBe("on");
  });
});
