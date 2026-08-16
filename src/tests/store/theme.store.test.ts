import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

// The theme store applies the current theme to the DOM on import (via
// document) and persist reads window.localStorage. We stub both before
// loading the module. No test here touches the persist API directly, so the
// bare localStorage stub is sufficient.
const setProperty = vi.fn();
const style = { setProperty };
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
    documentElement: { style },
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
    const theme = parseRetroismTheme(
      JSON.stringify({ base: "#222222", primary: "#c0c0c0" })
    );
    expect(theme!.name).toMatch(/^custom-/);
  });
});

describe("themeToJson", () => {
  it("serializes a theme to readable JSON", () => {
    const theme = parseRetroismTheme(
      JSON.stringify({ base: "#222222", label: "T", name: "t" })
    )!;
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
    expect(setProperty).toHaveBeenCalledWith(
      "--color-autocomplete",
      "#00ff41",
      "important"
    );
    expect(setProperty).toHaveBeenCalledWith(
      "--autocomplete-opacity",
      "0.35",
      "important"
    );
  });

  it("starts with the default win95 theme", () => {
    expect(useThemeStore.getState().currentTheme).toBe("win95");
    expect(useThemeStore.getState().customThemes).toEqual([]);
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
