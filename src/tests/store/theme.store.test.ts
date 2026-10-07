import { describe, expect, it } from "vitest";

import { THEMES } from "@/config/settings/themes.config";
import { persistKey } from "@/lib/state/persist.utils";
import { applyTheme, createThemeSignalStore, parseRetroismTheme } from "@/store/theme.store";

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  } as Storage;
}

function themeEnvelope(data: Record<string, unknown>): string {
  return JSON.stringify({ f: 1, store: "theme", sv: 0, ts: 0, data });
}

function storedTheme(currentTheme: unknown): Storage {
  return memoryStorage({
    [persistKey("theme")]: themeEnvelope({ currentTheme, customThemes: [] }),
  });
}

describe("theme signal unknown names", () => {
  it("falls back to win95 for a removed builtin theme", () => {
    const store = createThemeSignalStore({ getStorage: () => storedTheme("nord") });
    expect(store.atoms.currentTheme.get()).toBe("win95");
    store.persistor.dispose();
  });

  it("falls back to win95 for a non-string value", () => {
    const store = createThemeSignalStore({ getStorage: () => storedTheme(42) });
    expect(store.atoms.currentTheme.get()).toBe("win95");
    store.persistor.dispose();
  });

  it("keeps a known builtin theme", () => {
    const store = createThemeSignalStore({ getStorage: () => storedTheme("yorha") });
    expect(store.atoms.currentTheme.get()).toBe("yorha");
    store.persistor.dispose();
  });

  it("keeps a stored custom theme", () => {
    const custom = { ...THEMES[0], name: "mine" };
    const storage = memoryStorage({
      [persistKey("theme")]: themeEnvelope({ currentTheme: "mine", customThemes: [custom] }),
    });
    const store = createThemeSignalStore({ getStorage: () => storage });
    expect(store.atoms.currentTheme.get()).toBe("mine");
    store.persistor.dispose();
  });
});

describe("theme overlay", () => {
  it("writes the overlay to the dataset", () => {
    applyTheme("yorha");
    expect(document.documentElement.dataset.themeOverlay).toBe("grid");
    applyTheme("win95");
    expect(document.documentElement.dataset.themeOverlay).toBe("none");
  });

  it("parses a valid overlay on import and drops garbage", () => {
    const base = JSON.stringify({ name: "x", colors: { base: "#abc123" } });
    const withOverlay = JSON.parse(base) as Record<string, unknown>;
    withOverlay.overlay = "scanlines";
    expect(parseRetroismTheme(JSON.stringify(withOverlay))?.overlay).toBe("scanlines");
    withOverlay.overlay = "crt";
    expect(parseRetroismTheme(JSON.stringify(withOverlay))?.overlay).toBeUndefined();
  });

  it("parses valid component flags on import and drops garbage", () => {
    const base = { name: "x", colors: { base: "#abc123" } };
    const valid = { ...base, components: { titlebarArt: true, cardMeta: "short" } };
    expect(parseRetroismTheme(JSON.stringify(valid))?.components).toEqual({
      titlebarArt: true,
      cardMeta: "short",
    });
    const garbage = { ...base, components: { titlebarArt: "yes", cardMeta: "tiny" } };
    expect(parseRetroismTheme(JSON.stringify(garbage))?.components).toBeUndefined();
  });
});
