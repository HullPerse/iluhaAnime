import { describe, expect, it } from "vitest";

import { activeChordForKeybind, formatKeybindTitle } from "@/lib/titleHotkeys.utils";

describe("formatKeybindTitle", () => {
  it("prefixes the title with the humanized chord", () => {
    expect(formatKeybindTitle("Pause", "KeyP")).toBe("[P]: Pause");
    expect(formatKeybindTitle("Find on page", "ctrl+KeyK")).toBe("[Ctrl+K]: Find on page");
  });

  it("renders glyph chords as-is", () => {
    expect(formatKeybindTitle("Resize", "BracketLeft")).toBe("[[]: Resize");
  });

  it("returns the bare title when unbound", () => {
    expect(formatKeybindTitle("Pause", null)).toBe("Pause");
    expect(formatKeybindTitle("Pause", undefined)).toBe("Pause");
  });

  it("never prefixes an empty title", () => {
    expect(formatKeybindTitle("", "KeyP")).toBe("");
  });
});

describe("activeChordForKeybind", () => {
  it("returns the manifest default without overrides", () => {
    expect(activeChordForKeybind({}, "tree.builtin")).toBe("KeyP");
  });

  it("follows a rebound chord", () => {
    expect(activeChordForKeybind({ "tree.builtin": "KeyX" }, "tree.builtin")).toBe("KeyX");
  });

  it("returns null when unbound or unknown", () => {
    expect(activeChordForKeybind({ "tree.builtin": null }, "tree.builtin")).toBeNull();
    expect(activeChordForKeybind({}, "no.such.entry")).toBeNull();
  });
});
