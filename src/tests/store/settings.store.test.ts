import { describe, expect, it, vi, beforeAll } from "vitest";

// zustand v5 only exposes the persist API when storage is available, so we
// stub localStorage before dynamically importing the store.
const storage = new Map<string, string>();

let useSettingsStore: (typeof import("@/store/settings.store"))["useSettingsStore"];

beforeAll(async () => {
  // zustand persist reads `window.localStorage`; nothing else here touches
  // window, so a minimal stub is safe.
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
    const result = migrate!({ dlLimit: 500, language: "en" } as never, 1) as {
      language: string;
      dlLimit: number;
    };
    expect(result.language).toBe("en");
    expect(result.dlLimit).toBe(500);
  });

  it("returns an empty object for non-object state", () => {
    const migrate = useSettingsStore.persist.getOptions()?.migrate;
    expect(migrate!(null, 1)).toEqual({});
  });
});

describe("useSettingsStore hidden player items", () => {
  it("persists folder visibility changes without deleting the path", () => {
    useSettingsStore.setState({ hiddenPlayerFolders: [] });
    useSettingsStore.getState().hidePlayerFolder("C:\\Anime\\Season 1");
    useSettingsStore.getState().hidePlayerFolder("c:/anime/season 1/");
    expect(useSettingsStore.getState().hiddenPlayerFolders).toEqual([
      "C:\\Anime\\Season 1",
    ]);

    useSettingsStore.getState().unhidePlayerFolder("c:/anime/season 1");
    expect(useSettingsStore.getState().hiddenPlayerFolders).toEqual([]);
  });

  it("hides and unhides torrents by stable info hash", () => {
    useSettingsStore.setState({ hiddenPlayerTorrents: [] });
    useSettingsStore.getState().hidePlayerTorrent("ABC123");
    useSettingsStore.getState().hidePlayerTorrent("ABC123");
    expect(useSettingsStore.getState().hiddenPlayerTorrents).toEqual([
      "ABC123",
    ]);
    useSettingsStore.getState().unhidePlayerTorrent("ABC123");
    expect(useSettingsStore.getState().hiddenPlayerTorrents).toEqual([]);
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
    useSettingsStore.setState({ dlLimit: null, language: "ru" });
    useSettingsStore.getState().patch({ dlLimit: 200 });
    const s = useSettingsStore.getState();
    expect(s.dlLimit).toBe(200);
    expect(s.language).toBe("ru");
  });
});
