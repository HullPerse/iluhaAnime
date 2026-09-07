import { describe, expect, it } from "vitest";

import { buildShadow, buildWallpaperFilter } from "@/lib/search/wallpaper.utils";

describe("buildWallpaperFilter", () => {
  it("renders the stored dim by default", () => {
    expect(buildWallpaperFilter()).toBe("brightness(75%)");
  });

  it("returns none when every knob is neutral", () => {
    expect(
      buildWallpaperFilter({ brightness: 100, contrast: 100, saturate: 100, blur: 0, opacity: 100 })
    ).toBe("none");
  });

  it("composes only non-neutral knobs", () => {
    expect(buildWallpaperFilter({ contrast: 110, blur: 6 })).toBe(
      "brightness(75%) contrast(110%) blur(6px)"
    );
  });
});

describe("buildShadow", () => {
  const off = { top: false, right: false, bottom: false, left: false };
  const shadow = { sides: off, intensity: 50, color: "#000000" };

  it("is absent without enabled sides and zero intensity", () => {
    expect(buildShadow()).toBeUndefined();
    expect(buildShadow(shadow)).toBeUndefined();
    expect(buildShadow({ sides: { ...off, top: true }, intensity: 0 })).toBeUndefined();
  });

  it("paints one layer per enabled side", () => {
    expect(buildShadow({ ...shadow, sides: { ...off, top: true } })).toBe(
      "0 -8px 40px rgba(0,0,0,0.5)"
    );
    expect(
      buildShadow({ ...shadow, sides: { top: true, right: true, bottom: true, left: true } })
    ).toBe(
      "0 -8px 40px rgba(0,0,0,0.5), 8px 0 40px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.5), -8px 0 40px rgba(0,0,0,0.5)"
    );
  });

  it("renders wallpaper shadows as confined inset", () => {
    expect(buildShadow({ ...shadow, sides: { ...off, bottom: true } }, true)).toBe(
      "inset 0 -8px 40px -8px rgba(0,0,0,0.5)"
    );
  });

  it("scales reach with intensity and falls back to black", () => {
    expect(buildShadow({ sides: { ...off, left: true }, intensity: 100, color: "nope" })).toBe(
      "-16px 0 80px rgba(0,0,0,1)"
    );
  });
});
