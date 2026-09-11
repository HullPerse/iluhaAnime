import { describe, expect, it } from "vitest";

import { buildShadow, buildShadowGradients, buildWallpaperFilter } from "@/lib/search/wallpaper.utils";

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

  it("derives offset from length and blur from softness", () => {
    expect(
      buildShadow({ ...shadow, sides: { ...off, bottom: true }, length: 15, softness: 5 })
    ).toBe("0 15px 5px rgba(0,0,0,0.5)");
  });

  it("scales alpha with intensity and falls back to black", () => {
    expect(buildShadow({ sides: { ...off, left: true }, intensity: 100, color: "nope" })).toBe(
      "-8px 0 40px rgba(0,0,0,1)"
    );
  });
});

describe("buildShadowGradients", () => {
  const off = { top: false, right: false, bottom: false, left: false };
  const shadow = { sides: off, intensity: 50, color: "#000000" };

  it("is absent without sides, zero intensity, or zero geometry", () => {
    expect(buildShadowGradients()).toBeUndefined();
    expect(buildShadowGradients(shadow)).toBeUndefined();
    expect(buildShadowGradients({ sides: { ...off, top: true }, intensity: 0 })).toBeUndefined();
    expect(buildShadowGradients({ sides: { ...off, top: true }, length: 0, softness: 0 })).toBe(
      undefined
    );
  });

  it("paints one band per enabled side", () => {
    expect(buildShadowGradients({ ...shadow, sides: { ...off, top: true } })).toBe(
      "linear-gradient(to bottom, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px)"
    );
    expect(
      buildShadowGradients({
        ...shadow,
        sides: { top: true, right: true, bottom: true, left: true },
      })
    ).toBe(
      "linear-gradient(to bottom, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px), " +
        "linear-gradient(to left, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px), " +
        "linear-gradient(to top, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px), " +
        "linear-gradient(to right, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 8px, transparent 48px)"
    );
  });

  it("follows length, softness, intensity, and color", () => {
    expect(
      buildShadowGradients({
        sides: { ...off, top: true },
        length: 20,
        softness: 30,
        intensity: 100,
        color: "#112233",
      })
    ).toBe(
      "linear-gradient(to bottom, rgba(17,34,51,1) 0px, rgba(17,34,51,1) 20px, transparent 50px)"
    );
  });
});
