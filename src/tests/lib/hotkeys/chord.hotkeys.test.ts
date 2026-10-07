import { describe, expect, it } from "vitest";

import { chordKey, chordKeyFromEvent, parseChord } from "@/lib/hotkeys/chord.hotkeys";

describe("parseChord", () => {
  it("parses a bare code", () => {
    expect(parseChord("Space")).toEqual({ code: "Space", ctrl: false, shift: false, alt: false, meta: false });
  });

  it("parses modifier prefixes case-insensitively", () => {
    expect(parseChord("ctrl+Shift+KeyO")).toEqual({
      code: "KeyO",
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
    });
  });

  it("accepts control as a ctrl alias", () => {
    expect(parseChord("control+KeyP")?.ctrl).toBe(true);
  });

  it("parses alt+digit chords", () => {
    expect(parseChord("alt+Digit1")).toEqual({
      code: "Digit1",
      ctrl: false,
      shift: false,
      alt: true,
      meta: false,
    });
  });

  it("rejects empty input, missing code, bad codes, and unknown modifiers", () => {
    expect(parseChord("")).toBeUndefined();
    expect(parseChord("ctrl+")).toBeUndefined();
    expect(parseChord("ctrl+shift")).toBeUndefined();
    expect(parseChord("ctrl+foo bar")).toBeUndefined();
    expect(parseChord("super+KeyA")).toBeUndefined();
    expect(parseChord("KeyA+ctrl")).toBeUndefined();
  });
});

describe("chordKey", () => {
  it("encodes every modifier bit so distinct chords never collide", () => {
    const base = { code: "F1", ctrl: false, shift: false, alt: false, meta: false };
    const keys = new Set([
      chordKey(base),
      chordKey({ ...base, ctrl: true }),
      chordKey({ ...base, shift: true }),
      chordKey({ ...base, alt: true }),
      chordKey({ ...base, meta: true }),
    ]);
    expect(keys.size).toBe(5);
  });

  it("matches chordKeyFromEvent for the same combination", () => {
    const chord = parseChord("ctrl+Shift+KeyO");
    const event = new KeyboardEvent("keydown", {
      code: "KeyO",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(chord).toBeDefined();
    expect(chordKey(chord ?? { code: "", ctrl: false, shift: false, alt: false, meta: false })).toBe(
      chordKeyFromEvent(event)
    );
  });
});
