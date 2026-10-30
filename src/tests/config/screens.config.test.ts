import { describe, expect, it } from "vitest";

import { resolveFatalVariant, resolveSplashVariant } from "@/config/screens.config";

describe("fatal screens mapping", () => {
  it("maps windows themes to their historical screens", () => {
    expect(resolveFatalVariant("win95", false)).toBe("win95");
    expect(resolveFatalVariant("xp", false)).toBe("xp");
    expect(resolveFatalVariant("win7", false)).toBe("win7");
  });

  it("falls back to the generic screen for other and custom themes", () => {
    expect(resolveFatalVariant("gruvbox-dark", false)).toBe("generic");
    expect(resolveFatalVariant("anilist", false)).toBe("generic");
    expect(resolveFatalVariant("custom-123", false)).toBe("generic");
    expect(resolveFatalVariant("", false)).toBe("generic");
  });

  it("forces win95 in safe mode regardless of theme", () => {
    expect(resolveFatalVariant("xp", true)).toBe("win95");
    expect(resolveFatalVariant("custom-123", true)).toBe("win95");
  });

  it("maps yorha to its own splash screen", () => {
    expect(resolveSplashVariant("yorha", false)).toBe("yorha");
    expect(resolveSplashVariant("win95", false)).toBe("win95");
    expect(resolveSplashVariant("xp", false)).toBe("xp");
    expect(resolveSplashVariant("win7", false)).toBe("win7");
    expect(resolveSplashVariant("gruvbox-dark", false)).toBe("generic");
    expect(resolveSplashVariant("yorha", true)).toBe("win95");
  });

  it("maps yorha to the yorha splash and fatal screens", () => {
    expect(resolveSplashVariant("yorha", false)).toBe("yorha");
    expect(resolveFatalVariant("yorha", false)).toBe("yorha");
    expect(resolveSplashVariant("yorha", true)).toBe("win95");
    expect(resolveFatalVariant("yorha", true)).toBe("win95");
  });

  it("maps terminal and retroism to their own screens", () => {
    expect(resolveSplashVariant("terminal", false)).toBe("terminal");
    expect(resolveFatalVariant("terminal", false)).toBe("terminal");
    expect(resolveSplashVariant("retroism", false)).toBe("retroism");
    expect(resolveFatalVariant("retroism", false)).toBe("retroism");
    expect(resolveSplashVariant("terminal", true)).toBe("win95");
    expect(resolveFatalVariant("retroism", true)).toBe("win95");
  });
});
