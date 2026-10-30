import { beforeEach, describe, expect, it } from "vitest";

import { THEMES } from "@/config/graphics/themes.config";
import {
  applyTheme,
  previewTheme,
  resolveThemeFont,
  themePrePaintPayload,
} from "@/lib/core/appearance.utils";
import { diffTheme, resolveTheme } from "@/lib/graphics/themeResolve.utils";
import { buildThemeState, THEME_VAR_BINDINGS } from "@/lib/graphics/tokens.utils";
import { DEFAULT_FONT_FAMILY, toCssFontFamily } from "@/lib/graphics/font.utils";
import type { ThemeDefinition } from "@/types/graphics/theme";

function theme(name: string): ThemeDefinition {
  const found = THEMES.find((item) => item.name === name);
  if (!found) throw new Error(`missing built-in theme ${name}`);
  return found;
}

function resetRoot(): void {
  const root = document.documentElement;
  root.removeAttribute("style");
  delete root.dataset.theme;
  delete root.dataset.radius;
  delete root.dataset.bevel;
  delete root.dataset.themeOverlay;
  delete root.dataset.themeTitlebarArt;
  delete root.dataset.windowEffect;
}

beforeEach(() => {
  resetRoot();
});

describe("theme state", () => {
  it("fills every token binding for every built-in theme", () => {
    for (const item of THEMES) {
      const state = buildThemeState(item);
      for (const binding of THEME_VAR_BINDINGS) {
        expect(state.vars[binding.varName], `${item.name} ${binding.varName}`).toBeTruthy();
      }
      expect(state.datasets.theme).toBe(item.name);
    }
  });

  it("derives shape and overlay datasets from the theme", () => {
    expect(buildThemeState(theme("win95")).datasets).toEqual({
      bevel: "raised",
      radius: "none",
      theme: "win95",
      themeOverlay: "none",
      themeTitlebarArt: "off",
    });
    expect(buildThemeState(theme("xp")).datasets).toMatchObject({ radius: "frame" });
    expect(buildThemeState(theme("win7")).datasets).toMatchObject({ bevel: "flat" });
    expect(buildThemeState(theme("yorha")).datasets).toMatchObject({
      themeOverlay: "grid",
      themeTitlebarArt: "on",
    });
  });

  it("maps only declared overrides and skips absent ones", () => {
    const mono = buildThemeState(theme("mono"));
    expect(mono.overrides["--color-fav-gold"]).toBe("#8a8a8a");
    expect(mono.overrides["--color-torrent-seeding"]).toBe("#1e1e1e");
    expect(buildThemeState(theme("win95")).overrides).toEqual({});
  });

  it("keeps the pre-paint payload in step with the applied variables", () => {
    const state = buildThemeState(theme("yorha"));
    const payload = themePrePaintPayload(state);
    expect(payload.schema).toBe(2);
    expect(payload.themeName).toBe("yorha");
    expect(payload.datasets).toEqual(state.datasets);
    expect(Object.keys(payload.vars).sort()).toEqual(Object.keys(state.vars).sort());
    for (const binding of THEME_VAR_BINDINGS) {
      expect(payload.vars[binding.varName]).toBe(state.vars[binding.varName]);
    }
  });
});

describe("theme application", () => {
  it("writes variables, datasets and the v2 payload", () => {
    applyTheme("yorha");
    const root = document.documentElement;

    expect(root.style.getPropertyValue("--color-primary")).toBe("#dad4bb");
    expect(root.style.getPropertyValue("--titlebar-from")).toBe("#57544a");
    expect(root.dataset.theme).toBe("yorha");
    expect(root.dataset.radius).toBe("none");
    expect(root.dataset.bevel).toBe("raised");
    expect(root.dataset.themeOverlay).toBe("grid");
    expect(root.dataset.themeTitlebarArt).toBe("on");
    for (const binding of THEME_VAR_BINDINGS) {
      expect(root.style.getPropertyValue(binding.varName), binding.varName).toBeTruthy();
    }

    const raw = localStorage.getItem("themeVars");
    expect(raw).not.toBeNull();
    const payload = JSON.parse(raw ?? "{}") as {
      schema?: number;
      vars?: Record<string, string>;
      datasets?: Record<string, string>;
    };
    expect(payload.schema).toBe(2);
    expect(payload.vars?.["--color-primary"]).toBe("#dad4bb");
    expect(payload.datasets?.themeOverlay).toBe("grid");
  });

  it("clears an override when switching away from the theme that declared it", () => {
    applyTheme("mono");
    expect(document.documentElement.style.getPropertyValue("--color-fav-gold")).toBe("#8a8a8a");

    applyTheme("win95");
    expect(document.documentElement.style.getPropertyValue("--color-fav-gold")).toBe("");
  });

  it("previews a draft without replacing the stored payload", () => {
    const win95 = theme("win95");
    applyTheme("win95");
    const stored = localStorage.getItem("themeVars");

    previewTheme({ ...win95, colors: { ...win95.colors, primary: "#123456" } });
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#123456");
    expect(localStorage.getItem("themeVars")).toBe(stored);

    applyTheme("win95");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe(
      win95.colors.primary
    );
  });
});

describe("theme resolution", () => {
  it("merges a patch over the base theme without losing untouched tokens", () => {
    const win95 = theme("win95");
    const resolved = resolveTheme({
      builtins: THEMES,
      name: "win95",
      patch: { colors: { primary: "#123456" }, radius: "all" },
    });

    expect(resolved?.colors.primary).toBe("#123456");
    expect(resolved?.colors.text).toBe(win95.colors.text);
    expect(resolved?.radius).toBe("all");
    expect(resolved?.label).toBe(win95.label);
  });

  it("resolves custom themes when no built-in matches", () => {
    const custom = { ...theme("win95"), name: "mine" };
    const resolved = resolveTheme({ builtins: THEMES, customThemes: [custom], name: "mine" });
    expect(resolved?.name).toBe("mine");
  });

  it("returns undefined for an unknown theme", () => {
    expect(resolveTheme({ builtins: THEMES, name: "missing" })).toBeUndefined();
  });

  it("replaces override and component maps instead of merging them", () => {
    expect(
      resolveTheme({ builtins: THEMES, name: "mono", patch: { overrides: {} } })?.overrides
    ).toEqual({});
    expect(
      resolveTheme({ builtins: THEMES, name: "yorha", patch: { components: {} } })?.components
    ).toEqual({});
  });
});

describe("theme diff", () => {
  it("returns undefined when nothing changed", () => {
    expect(diffTheme(theme("win95"), theme("win95"))).toBeUndefined();
  });

  it("keeps only changed colors and traits", () => {
    const win95 = theme("win95");
    const patch = diffTheme(win95, {
      ...win95,
      colors: { ...win95.colors, primary: "#123456" },
      radius: "all",
    });

    expect(patch).toEqual({ colors: { primary: "#123456" }, radius: "all" });
  });

  it("replaces the overrides map so a patch can clear it", () => {
    const mono = theme("mono");
    expect(diffTheme(mono, { ...mono, overrides: {} })).toEqual({ overrides: {} });
  });

  it("clears components that the draft drops", () => {
    const yorha = theme("yorha");
    expect(diffTheme(yorha, { ...yorha, components: {} })).toEqual({ components: {} });
  });

  it("treats an absent autocomplete opacity as the runtime default", () => {
    const win95 = theme("win95");
    expect(
      diffTheme(win95, {
        ...win95,
        colors: { ...win95.colors, autocompleteOpacity: 0.6 },
      })
    ).toBeUndefined();
  });

  it("treats an absent autocomplete color as the muted fallback", () => {
    const mono = theme("mono");
    const base = { ...mono, colors: { ...mono.colors, autocomplete: undefined } };
    const draft = { ...mono, colors: { ...mono.colors, autocomplete: mono.colors.muted } };
    expect(diffTheme(base, draft)).toBeUndefined();
  });

  it("treats an absent trait as its runtime default", () => {
    const win95 = theme("win95");
    const base = { ...win95, bevel: undefined, overlay: undefined, radius: undefined };
    const draft = {
      ...win95,
      bevel: "raised" as const,
      overlay: "none" as const,
      radius: "none" as const,
    };
    expect(diffTheme(base, draft)).toBeUndefined();
  });
});

describe("theme font", () => {
  it("lets the stored app font win over the theme font", () => {
    localStorage.setItem("appFont", "Tahoma");
    expect(resolveThemeFont("Inter")).toBe(toCssFontFamily("Tahoma"));
  });

  it("falls back to the theme font and then the default", () => {
    expect(resolveThemeFont("Inter")).toBe("Inter");
    expect(resolveThemeFont(null)).toBe(DEFAULT_FONT_FAMILY);
  });
});
