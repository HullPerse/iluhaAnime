import { describe, expect, it } from "vitest";

import { resolveFatalVariant } from "@/config/fatal/screens.config";

describe("fatal screens mapping", () => {
  it("maps windows themes to their historical screens", () => {
    expect(resolveFatalVariant("win95", false)).toBe("win95");
    expect(resolveFatalVariant("xp", false)).toBe("xp");
    expect(resolveFatalVariant("win7", false)).toBe("win7");
  });

  it("falls back to the generic screen for other and custom themes", () => {
    expect(resolveFatalVariant("gruvbox-dark", false)).toBe("generic");
    expect(resolveFatalVariant("terminal", false)).toBe("generic");
    expect(resolveFatalVariant("custom-123", false)).toBe("generic");
    expect(resolveFatalVariant("", false)).toBe("generic");
  });

  it("forces win95 in safe mode regardless of theme", () => {
    expect(resolveFatalVariant("xp", true)).toBe("win95");
    expect(resolveFatalVariant("custom-123", true)).toBe("win95");
  });
});
