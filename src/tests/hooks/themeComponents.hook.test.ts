import { describe, expect, it } from "vitest";

import { resolveThemeComponents } from "@/hooks/themeComponents.hook";
import type { ThemeDefinition } from "@/types/theme";

function makeTheme(components: ThemeDefinition["components"]): ThemeDefinition {
  return {
    colors: {
      autocomplete: "#808080",
      background: "#222222",
      destructive: "#800000",
      field: "#ffffff",
      highlight: "#0000ff",
      linkHover: "#5c0000",
      muted: "#808080",
      primary: "#c0c0c0",
      secondary: "#000080",
      success: "#008000",
      surface: "#d0d0d0",
      text: "#000000",
      winHighlight: "#ffffff",
      winShadow: "#808080",
    },
    components,
    label: "Test",
    name: "test",
  };
}

describe("resolveThemeComponents", () => {
  it("resolves full meta without art for a missing theme", () => {
    expect(resolveThemeComponents(undefined)).toEqual({ titlebarArt: false, cardMeta: "full" });
  });

  it("resolves full meta without art when components are missing", () => {
    expect(resolveThemeComponents(makeTheme(undefined))).toEqual({
      titlebarArt: false,
      cardMeta: "full",
    });
  });

  it("passes titlebar art and short meta through", () => {
    expect(resolveThemeComponents(makeTheme({ titlebarArt: true, cardMeta: "short" }))).toEqual({
      titlebarArt: true,
      cardMeta: "short",
    });
  });
});
