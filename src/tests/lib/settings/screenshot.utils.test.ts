import { describe, expect, it } from "vitest";

import {
  canSaveScreenshot,
  defaultScreenshotName,
  matchesScreenshotHotkey,
} from "@/lib/settings/screenshot.utils";

function chord(partial: {
  code?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}) {
  return {
    code: "KeyP",
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    ...partial,
  };
}

describe("matchesScreenshotHotkey", () => {
  it("matches ctrl shift P exactly", () => {
    expect(matchesScreenshotHotkey(chord({}))).toBe(true);
  });

  it("rejects a missing modifier", () => {
    expect(matchesScreenshotHotkey(chord({ ctrlKey: false }))).toBe(false);
    expect(matchesScreenshotHotkey(chord({ shiftKey: false }))).toBe(false);
  });

  it("rejects an extra modifier", () => {
    expect(matchesScreenshotHotkey(chord({ altKey: true }))).toBe(false);
    expect(matchesScreenshotHotkey(chord({ metaKey: true }))).toBe(false);
  });

  it("rejects another key", () => {
    expect(matchesScreenshotHotkey(chord({ code: "KeyO" }))).toBe(false);
    expect(matchesScreenshotHotkey(chord({ code: "P" }))).toBe(false);
  });

  it("ignores the physical layout value in favour of the code", () => {
    expect(matchesScreenshotHotkey(chord({ code: "KeyP" }))).toBe(true);
  });
});

describe("defaultScreenshotName", () => {
  it("uses the product prefix", () => {
    expect(defaultScreenshotName()).toBe("iluhaAnime_screenshot");
  });
});

describe("canSaveScreenshot", () => {
  it("requires both a name and a folder", () => {
    expect(canSaveScreenshot("shot", "D:/Shots")).toBe(true);
    expect(canSaveScreenshot("   ", "D:/Shots")).toBe(false);
    expect(canSaveScreenshot("shot", "   ")).toBe(false);
    expect(canSaveScreenshot("", "")).toBe(false);
  });
});
