import { beforeEach, describe, expect, it } from "vitest";

import themeInitSource from "../../../public/theme-init.js?raw";

function runInit(): void {
  // The script is a static local asset, not user input; executing it is the only way to prove
  // the pre-paint payload is applied before React exists.
  // oxlint-disable-next-line no-new-func, typescript/no-implied-eval
  new Function(themeInitSource)();
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

describe("theme-init v2 payload", () => {
  it("applies every listed variable, override and dataset without knowing token names", () => {
    localStorage.setItem(
      "themeVars",
      JSON.stringify({
        datasets: {
          bevel: "raised",
          radius: "frame",
          theme: "xp",
          themeOverlay: "none",
          themeTitlebarArt: "off",
        },
        fontFamily: "Tahoma",
        overrides: { "--color-torrent-done": "#008000", "--not-a-color": "red" },
        schema: 2,
        themeName: "xp",
        vars: {
          "--color-field": "#ffffff",
          "--color-primary": "#ece9d8",
          "--ui-window-alpha": "80%",
        },
      })
    );

    runInit();

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--color-primary")).toBe("#ece9d8");
    expect(root.style.getPropertyValue("--color-field")).toBe("#ffffff");
    expect(root.style.getPropertyValue("--ui-window-alpha")).toBe("80%");
    expect(root.style.getPropertyValue("--color-torrent-done")).toBe("#008000");
    expect(root.style.getPropertyValue("--not-a-color")).toBe("");
    expect(root.dataset.theme).toBe("xp");
    expect(root.dataset.radius).toBe("frame");
    expect(root.dataset.bevel).toBe("raised");
    expect(root.dataset.themeOverlay).toBe("none");
    expect(root.dataset.themeTitlebarArt).toBe("off");
    expect(root.style.getPropertyValue("--font-family")).toBe("Tahoma");
  });

  it("prefers the stored app font over the theme font", () => {
    localStorage.setItem("appFont", "Tahoma");
    localStorage.setItem(
      "themeVars",
      JSON.stringify({
        fontFamily: "Inter",
        schema: 2,
        themeName: "win95",
        vars: { "--color-primary": "#c0c0c0" },
      })
    );

    runInit();

    expect(document.documentElement.style.getPropertyValue("--font-family")).toContain('"Tahoma"');
  });
});

describe("theme-init v1 payload", () => {
  it("still applies the flat payload, including the field color", () => {
    localStorage.setItem(
      "themeVars",
      JSON.stringify({
        autocompleteOpacity: 0.4,
        background: "#222222",
        field: "#fefefe",
        fontFamily: null,
        primary: "#c0c0c0",
        themeName: "win95",
        windowAlpha: "82%",
      })
    );

    runInit();

    const root = document.documentElement;
    expect(root.style.getPropertyValue("--color-primary")).toBe("#c0c0c0");
    expect(root.style.getPropertyValue("--color-field")).toBe("#fefefe");
    expect(root.style.getPropertyValue("--autocomplete-opacity")).toBe("0.4");
    expect(root.style.getPropertyValue("--ui-window-alpha")).toBe("82%");
    expect(root.dataset.theme).toBe("win95");
  });
});

describe("theme-init window style", () => {
  it("applies the stored window effect before the theme payload", () => {
    localStorage.setItem(
      "settings",
      JSON.stringify({ state: { windowEffect: "acrylic", windowTintOpacity: 0.8 } })
    );

    runInit();

    expect(document.documentElement.dataset.windowEffect).toBe("acrylic");
    expect(document.documentElement.style.getPropertyValue("--ui-window-opacity")).toBe("80%");
  });

  it("survives a malformed payload without throwing", () => {
    localStorage.setItem("themeVars", "{");
    expect(() => runInit()).not.toThrow();
  });
});
