import { describe, expect, it, vi, beforeAll } from "vitest";

const storage = new Map<string, string>();

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
    expect(result.searchShadow).toEqual({ sides: off, intensity: 50, color: "#000000" });
    expect(result.wallpaperShadow).toEqual({ sides: off, intensity: 50, color: "#000000" });
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
