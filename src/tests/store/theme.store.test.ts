import { describe, expect, it } from "vitest";

import { THEMES } from "@/config/settings/themes.config";
import { persistKey } from "@/lib/state/persist.utils";
import { applyTheme } from "@/lib/theme/appearance";
import {
  createThemeSignalStore,
  parseRetroismTheme,
  parseThemeFile,
  THEME_SCHEMA_VERSION,
  themePatchToJson,
} from "@/store/theme.store";

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

function themeEnvelope(data: Record<string, unknown>, schemaVersion = 0): string {
  return JSON.stringify({
    f: 1,
    store: "theme",
    sv: schemaVersion,
    ts: 0,
    data,
  });
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

describe("theme extends", () => {
  const base = THEMES.find((theme) => theme.name === "xp");
  if (!base) throw new Error("missing xp theme");

  const resolveBuiltin = (name: string) => THEMES.find((theme) => theme.name === name);

  it("inherits a pack and applies a delta", () => {
    const parsed = parseRetroismTheme(
      JSON.stringify({
        colors: { secondary: "#112233" },
        extends: "xp",
        label: "My XP",
        name: "my-xp",
        radius: "all",
      }),
      resolveBuiltin
    );

    expect(parsed?.name).toBe("my-xp");
    expect(parsed?.label).toBe("My XP");
    expect(parsed?.colors.secondary).toBe("#112233");
    expect(parsed?.colors.primary).toBe(base.colors.primary);
    expect(parsed?.radius).toBe("all");
    expect(parsed?.bevel).toBe(base.bevel);
    expect(parsed?.overlay).toBe(base.overlay);
  });

  it("merges overrides and components over the base pack", () => {
    const mono = THEMES.find((theme) => theme.name === "mono");
    if (!mono) throw new Error("missing mono theme");

    const parsed = parseRetroismTheme(
      JSON.stringify({
        components: { cardMeta: "short" },
        extends: "mono",
        name: "my-mono",
        overrides: { favGold: "#ffffff" },
      }),
      resolveBuiltin
    );

    expect(parsed?.overrides?.favGold).toBe("#ffffff");
    expect(parsed?.overrides?.torrentSeeding).toBe(mono.overrides?.torrentSeeding);
    expect(parsed?.components?.cardMeta).toBe("short");
    expect(parsed?.components?.titlebarArt).toBe(mono.components?.titlebarArt);
  });

  it("rejects an extends pack without a resolver or with an unknown base", () => {
    const json = JSON.stringify({ extends: "xp", name: "my-xp" });
    expect(parseRetroismTheme(json)).toBeNull();
    expect(parseRetroismTheme(json, () => undefined)).toBeNull();
  });

  it("keeps a full theme working without extends", () => {
    const parsed = parseRetroismTheme(
      JSON.stringify({ colors: { primary: "#123456" }, name: "x" })
    );
    expect(parsed?.name).toBe("x");
    expect(parsed?.colors.primary).toBe("#123456");
  });
});

describe("theme patch files", () => {
  it("round-trips an exported patch", () => {
    const patch = {
      colors: { primary: "#123456" },
      overrides: { favGold: "#ffcc00" },
      radius: "all" as const,
    };

    expect(parseThemeFile(themePatchToJson("xp", patch))).toEqual({
      base: "xp",
      kind: "patch",
      patch,
    });
  });

  it("drops invalid fields and keeps valid ones", () => {
    const parsed = parseThemeFile(
      JSON.stringify({
        base: "xp",
        format: "iluha-theme-patch",
        patch: {
          colors: { primary: "nope", secondary: "#112233" },
          components: { titlebarArt: "yes" },
          overrides: { favGold: "nope" },
          radius: "round",
        },
        version: 1,
      })
    );

    expect(parsed).toEqual({
      base: "xp",
      kind: "patch",
      patch: { colors: { secondary: "#112233" } },
    });
  });

  it("keeps explicit component flags in a patch", () => {
    const parsed = parseThemeFile(
      JSON.stringify({
        base: "win95",
        format: "iluha-theme-patch",
        patch: { components: { cardMeta: "short", titlebarArt: false } },
        version: 1,
      })
    );

    expect(parsed).toEqual({
      base: "win95",
      kind: "patch",
      patch: { components: { cardMeta: "short", titlebarArt: false } },
    });
  });

  it("keeps empty component and override maps as clear operations", () => {
    const parsed = parseThemeFile(
      JSON.stringify({
        base: "mono",
        format: "iluha-theme-patch",
        patch: { components: {}, overrides: {} },
        version: 1,
      })
    );

    expect(parsed).toEqual({
      base: "mono",
      kind: "patch",
      patch: { components: {}, overrides: {} },
    });
  });

  it("rejects an empty patch, an unknown version, or a missing base", () => {
    const envelope = { format: "iluha-theme-patch", version: 1, base: "xp" };
    expect(parseThemeFile(JSON.stringify({ ...envelope, patch: {} }))).toBeNull();
    expect(
      parseThemeFile(JSON.stringify({ ...envelope, patch: { radius: "all" }, version: 2 }))
    ).toBeNull();
    expect(
      parseThemeFile(JSON.stringify({ ...envelope, base: "", patch: { radius: "all" } }))
    ).toBeNull();
  });

  it("rejects null, arrays, and primitive JSON", () => {
    expect(parseThemeFile("null")).toBeNull();
    expect(parseThemeFile("[]")).toBeNull();
    expect(parseThemeFile('"text"')).toBeNull();
    expect(parseRetroismTheme("null")).toBeNull();
  });

  it("parses a plain theme file through the same entry point", () => {
    const parsed = parseThemeFile(JSON.stringify({ colors: { base: "#abc123" }, name: "x" }));
    expect(parsed?.kind).toBe("theme");
    if (parsed?.kind === "theme") expect(parsed.theme.name).toBe("x");
  });
});

describe("theme patches", () => {
  it("migrates v0 data and adds an empty patch map", () => {
    const storage = storedTheme("win95");
    const store = createThemeSignalStore({ getStorage: () => storage });
    expect(store.atoms.themePatches.get()).toEqual({});

    store.setTheme("yorha");
    store.persistor.flush();
    const persisted = store.persistor.read();
    expect(persisted?.schemaVersion).toBe(THEME_SCHEMA_VERSION);
    expect(persisted?.data.themePatches).toEqual({});
    store.persistor.dispose();
  });

  it("applies a stored patch to the active theme", () => {
    const storage = memoryStorage({
      [persistKey("theme")]: themeEnvelope(
        {
          currentTheme: "win95",
          customThemes: [],
          themePatches: { win95: { colors: { primary: "#123456" } } },
        },
        THEME_SCHEMA_VERSION
      ),
    });
    const store = createThemeSignalStore({ getStorage: () => storage });

    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#123456");
    store.persistor.dispose();
  });

  it("ignores malformed patch entries", () => {
    const storage = memoryStorage({
      [persistKey("theme")]: themeEnvelope(
        {
          currentTheme: "win95",
          customThemes: [],
          themePatches: { win95: 42, other: null },
        },
        THEME_SCHEMA_VERSION
      ),
    });
    const store = createThemeSignalStore({ getStorage: () => storage });

    expect(store.atoms.themePatches.get()).toEqual({});
    store.persistor.dispose();
  });

  it("stores and clears a patch for the active theme", () => {
    const storage = memoryStorage();
    const store = createThemeSignalStore({ getStorage: () => storage });
    const win95 = THEMES.find((theme) => theme.name === "win95");

    store.setThemePatch("win95", { colors: { primary: "#123456" } });
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#123456");
    store.persistor.flush();
    expect(store.persistor.read()?.data.themePatches).toEqual({
      win95: { colors: { primary: "#123456" } },
    });

    store.clearThemePatch("win95");
    expect(store.atoms.themePatches.get()).toEqual({});
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe(
      win95?.colors.primary
    );
    store.persistor.dispose();
  });

  it("drops a custom theme patch with the theme", () => {
    const storage = memoryStorage();
    const store = createThemeSignalStore({ getStorage: () => storage });
    const custom = { ...THEMES[0], name: "mine" };

    store.addCustomTheme(custom);
    store.setTheme("mine");
    store.setThemePatch("mine", { radius: "all" });
    store.removeCustomTheme("mine");

    expect(store.atoms.themePatches.get().mine).toBeUndefined();
    expect(store.atoms.currentTheme.get()).toBe("win95");
    store.persistor.dispose();
  });
});
