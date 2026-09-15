import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

import { THEMES, THEME_OVERRIDE_VARS } from "@/config/settings/themes.config";

const setProperty = vi.fn();
const removeProperty = vi.fn();
const style = { removeProperty, setProperty };
const dataset: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn(),
  removeItem: vi.fn(),
  setItem: vi.fn(),
};

let useThemeStore: (typeof import("@/store/theme.store"))["useThemeStore"];
let parseRetroismTheme: (typeof import("@/store/theme.store"))["parseRetroismTheme"];
let themeToJson: (typeof import("@/store/theme.store"))["themeToJson"];
let applyTheme: (typeof import("@/store/theme.store"))["applyTheme"];

beforeAll(async () => {
  vi.stubGlobal("document", {
    documentElement: { dataset, style },
  });
  vi.stubGlobal("localStorage", localStorageMock);
  const mod = await import("@/store/theme.store");
  useThemeStore = mod.useThemeStore;
  parseRetroismTheme = mod.parseRetroismTheme;
  themeToJson = mod.themeToJson;
  applyTheme = mod.applyTheme;
});

beforeEach(() => {
  setProperty.mockClear();
  removeProperty.mockClear();
  delete dataset.radius;
  delete dataset.bevel;
  delete dataset.theme;
  useThemeStore.setState({ currentTheme: "win95", customThemes: [] });
});

describe("parseRetroismTheme", () => {
  it("parses a full retroism-style theme", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({
        accent: "#000080",
        base: "#222222",
        label: "My Theme",
        name: "my-theme",
        primary: "#c0c0c0",
      })
    );
    expect(theme).not.toBeNull();
    expect(theme!.name).toBe("my-theme");
    expect(theme!.label).toBe("My Theme");
    expect(theme!.colors.background).toBe("#222222");
    expect(theme!.colors.primary).toBe("#c0c0c0");
    expect(theme!.colors.secondary).toBe("#000080");
  });

  it("parses autocomplete color and opacity when provided", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({
        colors: {
          autocomplete: "#00ff41",
          autocompleteOpacity: 0.35,
          base: "#222222",
          primary: "#c0c0c0",
        },
        name: "custom",
      })
    );
    expect(theme!.colors.autocomplete).toBe("#00ff41");
    expect(theme!.colors.autocompleteOpacity).toBe(0.35);
  });

  it("normalizes invalid autocomplete styling on import", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({
        colors: {
          autocomplete: "not-a-color",
          autocompleteOpacity: 4,
          base: "#111111",
          primary: "#c0c0c0",
        },
        name: "invalid-style",
      })
    )!;
    expect(theme.colors.autocomplete).toBe("#808080");
    expect(theme.colors.autocompleteOpacity).toBe(1);
  });

  it("falls back to sensible defaults for missing colors", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({ base: "#111111", label: "Min", name: "min" })
    );
    expect(theme!.colors.text).toBe("#000000");
    expect(theme!.colors.destructive).toBe("#800000");
    expect(theme!.colors.winShadow).toBe("#808080");
  });

  it("returns null for invalid JSON", () => {
    expect(parseRetroismTheme("{nope")).toBeNull();
  });

  it("returns null for JSON without theme colors", () => {
    expect(parseRetroismTheme(JSON.stringify({ foo: 1 }))).toBeNull();
  });

  it("generates a name when missing", () => {
    const theme = parseRetroismTheme(JSON.stringify({ base: "#222222", primary: "#c0c0c0" }));
    expect(theme!.name).toMatch(/^custom-/);
  });
});

describe("themeToJson", () => {
  it("serializes a theme to readable JSON", () => {
    const theme = parseRetroismTheme(JSON.stringify({ base: "#222222", label: "T", name: "t" }))!;
    const json = themeToJson(theme);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("t");
    expect(parsed.colors.background).toBe("#222222");
  });
});

describe("useThemeStore", () => {
  it("applies autocomplete theme variables to the document", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({
        colors: {
          autocomplete: "#00ff41",
          autocompleteOpacity: 0.35,
          base: "#111111",
          primary: "#c0c0c0",
        },
        name: "custom",
      })
    )!;
    applyTheme("custom", [theme]);
    expect(setProperty).toHaveBeenCalledWith("--color-autocomplete", "#00ff41", "important");
    expect(setProperty).toHaveBeenCalledWith("--autocomplete-opacity", "0.35", "important");
  });

  it("applies window chrome colors to the document", () => {
    applyTheme("win95");
    expect(setProperty).toHaveBeenCalledWith("--color-win-highlight", "#ffffff", "important");
    expect(setProperty).toHaveBeenCalledWith("--color-win-shadow", "#808080", "important");
  });

  it("adds a custom theme", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({ base: "#111111", label: "Custom", name: "custom" })
    )!;
    useThemeStore.getState().addCustomTheme(theme);
    expect(useThemeStore.getState().customThemes).toHaveLength(1);
  });

  it("replaces a custom theme with the same name", () => {
    const first = parseRetroismTheme(
      JSON.stringify({ base: "#111111", label: "One", name: "custom" })
    )!;
    const second = parseRetroismTheme(
      JSON.stringify({ base: "#222222", label: "Two", name: "custom" })
    )!;
    useThemeStore.getState().addCustomTheme(first);
    useThemeStore.getState().addCustomTheme(second);
    const list = useThemeStore.getState().customThemes;
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("Two");
  });

  it("removes a custom theme and falls back to win95 when active", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({ base: "#111111", label: "Custom", name: "custom" })
    )!;
    useThemeStore.getState().addCustomTheme(theme);
    useThemeStore.getState().setTheme("custom");
    useThemeStore.getState().removeCustomTheme("custom");
    const s = useThemeStore.getState();
    expect(s.customThemes).toEqual([]);
    expect(s.currentTheme).toBe("win95");
  });
});

describe("applyTheme title text", () => {
  it("sets the title text token from the titlebar colour", () => {
    applyTheme("win95", []);
    expect(setProperty).toHaveBeenCalledWith("--color-title-text", "#ffffff", "important");

    setProperty.mockClear();
    applyTheme("custom-light", [
      {
        colors: { ...THEMES[0].colors, secondary: "#f0f0f0" },
        label: "Custom Light",
        name: "custom-light",
      },
    ]);
    expect(setProperty).toHaveBeenCalledWith("--color-title-text", "#000000", "important");
  });
});

describe("applyTheme field token", () => {
  it("publishes the field colour declared by the theme", () => {
    applyTheme("dracula", []);
    expect(setProperty).toHaveBeenCalledWith("--color-field", "#313341", "important");

    setProperty.mockClear();
    applyTheme("win95", []);
    expect(setProperty).toHaveBeenCalledWith("--color-field", "#ffffff", "important");
  });

  it("derives a field colour for themes stored before the token existed", () => {
    const colors = { ...THEMES[0].colors } as Partial<(typeof THEMES)[number]["colors"]>;
    delete colors.field;

    applyTheme("legacy", [
      {
        colors: { ...colors, primary: "#c0c0c0" } as (typeof THEMES)[number]["colors"],
        label: "Legacy Light",
        name: "legacy",
      },
    ]);
    expect(setProperty).toHaveBeenCalledWith("--color-field", "#ffffff", "important");

    setProperty.mockClear();
    applyTheme("legacy-dark", [
      {
        colors: { ...colors, primary: "#282c34" } as (typeof THEMES)[number]["colors"],
        label: "Legacy Dark",
        name: "legacy-dark",
      },
    ]);
    expect(setProperty).toHaveBeenCalledWith("--color-field", "#1c1f24", "important");
  });
});

describe("applyTheme window tint", () => {
  it("publishes the tint alpha the window effect uses", () => {
    applyTheme("win95", []);
    expect(setProperty).toHaveBeenCalledWith("--ui-window-alpha", "72%", "important");

    setProperty.mockClear();
    applyTheme("one-dark", []);
    expect(setProperty).toHaveBeenCalledWith("--ui-window-alpha", "88%", "important");
  });

  it("persists the alpha, so the pre-React init script can paint the first frame", () => {
    applyTheme("win95", []);
    const payload = localStorageMock.setItem.mock.calls.at(-1)?.[1] as string;
    expect(JSON.parse(payload).windowAlpha).toBe("72%");
  });
});

describe("applyTheme shape metadata", () => {
  it("publishes the radius and bevel preset declared by the theme", () => {
    applyTheme("win11", []);
    expect(dataset.radius).toBe("all");
    expect(dataset.bevel).toBe("flat");

    applyTheme("win95", []);
    expect(dataset.radius).toBe("none");
    expect(dataset.bevel).toBe("raised");
  });

  it("falls back to square frames for themes without shape metadata", () => {
    const theme = THEMES.find((item) => item.name === "dracula")!;
    expect(theme.radius).toBeUndefined();
    expect(theme.bevel).toBeUndefined();

    applyTheme("dracula", []);
    expect(dataset.radius).toBe("none");
    expect(dataset.bevel).toBe("raised");
  });
});

describe("applyTheme titlebar gradient", () => {
  it("paints the wash declared by the theme", () => {
    const gradient = THEMES.find((item) => item.name === "win7")!.titlebarGradient!;
    applyTheme("win7", []);
    expect(setProperty).toHaveBeenCalledWith("--titlebar-from", gradient.from, "important");
    expect(setProperty).toHaveBeenCalledWith("--titlebar-to", gradient.to, "important");
  });

  it("collapses both wash stops onto the accent when the theme has none", () => {
    const secondary = THEMES.find((item) => item.name === "win95")!.colors.secondary;
    applyTheme("win95", []);
    expect(setProperty).toHaveBeenCalledWith("--titlebar-from", secondary, "important");
    expect(setProperty).toHaveBeenCalledWith("--titlebar-to", secondary, "important");
  });
});

describe("applyTheme token overrides", () => {
  it("writes the tokens a limited-palette theme overrides", () => {
    applyTheme("mono", []);
    expect(setProperty).toHaveBeenCalledWith("--color-fav-gold", "#8a8a8a", "important");
    expect(setProperty).toHaveBeenCalledWith("--color-torrent-seeding", "#1e1e1e", "important");
  });

  it("clears every override when switching to a theme that has none", () => {
    applyTheme("mono", []);
    removeProperty.mockClear();

    applyTheme("win95", []);
    for (const variable of Object.values(THEME_OVERRIDE_VARS)) {
      expect(removeProperty).toHaveBeenCalledWith(variable);
    }
  });
});
