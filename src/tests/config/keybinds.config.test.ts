import { describe, expect, it } from "vitest";

import {
  DIGIT_KEYS,
  KEYBINDS,
  PLAYER_HOTKEYS,
  VIEW_MODE_DIGITS,
} from "@/config/settings/keybinds.config";
import { parseChord } from "@/lib/core/chordHotkeys.utils";
import { createHotkeyRegistry } from "@/lib/core/registryHotkeys.utils";

describe("KEYBINDS", () => {
  it("gives every entry a unique parseable chord", () => {
    expect(KEYBINDS.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const keybind of KEYBINDS) {
      expect(parseChord(keybind.chord), keybind.chord).toBeDefined();
      expect(seen.has(keybind.chord), keybind.chord).toBe(false);
      seen.add(keybind.chord);
    }
  });

  it("resolves every entry through the registry", () => {
    const registry = createHotkeyRegistry(PLAYER_HOTKEYS);
    expect(registry.size).toBe(KEYBINDS.length);
    for (const keybind of KEYBINDS) {
      const chord = parseChord(keybind.chord);
      expect(chord).toBeDefined();
      if (!chord) continue;
      const key = `${chord.code}:${chord.ctrl}:${chord.shift}:${chord.alt}:${chord.meta}`;
      expect(registry.get(key)?.id, keybind.chord).toBe(keybind.action);
    }
  });

  it("rejects the same code with wrong modifiers", () => {
    const registry = createHotkeyRegistry(PLAYER_HOTKEYS);
    expect(registry.get("Space:true:false:false:false")).toBeUndefined();
    expect(registry.get("KeyF:false:true:false:false")).toBeUndefined();
    expect(registry.get("Slash:false:false:false:false")).toBeUndefined();
    expect(registry.get("Slash:true:false:false:false")).toBeUndefined();
    expect(registry.get("F1:false:true:false:false")).toBeUndefined();
    expect(registry.get("Escape:true:false:false:false")).toBeUndefined();
    expect(registry.get("KeyP:true:true:false:false")).toBeUndefined();
  });

  it("keeps single-shot actions on once and held actions on hold", () => {
    const repeatOf = (action: string) =>
      KEYBINDS.find((keybind) => keybind.action === action)?.repeat;
    expect(repeatOf("playPause")).toBe("once");
    expect(repeatOf("toggleMute")).toBe("once");
    expect(repeatOf("toggleCheatsheet")).toBe("once");
    expect(repeatOf("exitCinemaMode")).toBe("once");
    expect(repeatOf("seekForward")).toBe("hold");
    expect(repeatOf("seekBackward")).toBe("hold");
    expect(repeatOf("volumeUp")).toBe("hold");
    expect(repeatOf("frameForward")).toBe("hold");
    expect(repeatOf("subtitleOffsetDownFine")).toBe("hold");
  });
});

describe("KEYBINDS from the player gap audit", () => {
  const entryOf = (action: string) => KEYBINDS.find((keybind) => keybind.action === action);

  it("binds every approved chord", () => {
    expect(entryOf("togglePlaylist")?.chord).toBe("KeyL");
    expect(entryOf("skipChapter")?.chord).toBe("KeyN");
    expect(entryOf("speedDown")?.chord).toBe("Shift+Comma");
    expect(entryOf("speedUp")?.chord).toBe("Shift+Period");
    expect(entryOf("speedReset")?.chord).toBe("KeyR");
    expect(entryOf("cycleSubtitle")?.chord).toBe("KeyV");
    expect(entryOf("cycleAudio")?.chord).toBe("KeyB");
    expect(entryOf("seekToStart")?.chord).toBe("Home");
    expect(entryOf("seekToEnd")?.chord).toBe("End");
  });

  it("binds the view presets to bare 1, 2 and 3", () => {
    expect(entryOf("viewMinimal")?.chord).toBe("Digit1");
    expect(entryOf("viewCompact")?.chord).toBe("Digit2");
    expect(entryOf("viewNormal")?.chord).toBe("Digit3");
    for (const action of ["viewMinimal", "viewCompact", "viewNormal"]) {
      expect(entryOf(action)?.category, action).toBe("ui");
      expect(entryOf(action)?.repeat, action).toBe("once");
    }
  });

  it("binds always on top to ctrl+a", () => {
    expect(entryOf("toggleAlwaysOnTop")?.chord).toBe("ctrl+KeyA");
    expect(entryOf("toggleAlwaysOnTop")?.keys).toBe("Ctrl+A");
    expect(entryOf("toggleAlwaysOnTop")?.repeat).toBe("once");
  });

  it("moves the freed percent seeks to the shifted digits", () => {
    for (const digit of VIEW_MODE_DIGITS) {
      expect(entryOf(`seekPercent${digit}`)?.chord).toBe(`Shift+Digit${digit}`);
      expect(entryOf(`seekPercent${digit}`)?.keys).toBe(`Shift+${digit}`);
    }
  });

  it("binds every other bare digit to its tenth of the file", () => {
    for (const digit of DIGIT_KEYS) {
      if (VIEW_MODE_DIGITS.includes(digit)) continue;
      expect(entryOf(`seekPercent${digit}`)?.chord).toBe(`Digit${digit}`);
      expect(entryOf(`seekPercent${digit}`)?.keys).toBe(`${digit}`);
    }
    expect(KEYBINDS.filter((keybind) => keybind.action.startsWith("seekPercent"))).toHaveLength(
      DIGIT_KEYS.length
    );
  });

  it("leaves the shift-frame keys untouched", () => {
    expect(entryOf("frameBackward")?.chord).toBe("Comma");
    expect(entryOf("frameForward")?.chord).toBe("Period");
  });

  it("keeps every audited action a one-shot", () => {
    for (const action of [
      "togglePlaylist",
      "skipChapter",
      "speedDown",
      "speedUp",
      "speedReset",
      "cycleSubtitle",
      "cycleAudio",
      "seekToStart",
      "seekToEnd",
      "seekPercent5",
      "viewMinimal",
      "viewCompact",
      "viewNormal",
      "toggleAlwaysOnTop",
    ]) {
      expect(entryOf(action)?.repeat, action).toBe("once");
    }
  });

  it("gives every new entry a printable key label and a description", () => {
    for (const action of [
      "togglePlaylist",
      "speedDown",
      "seekPercent0",
      "seekPercent9",
      "seekPercent1",
      "viewMinimal",
      "toggleAlwaysOnTop",
    ]) {
      const entry = entryOf(action);
      expect(entry?.keys.length, action).toBeGreaterThan(0);
      expect(entry?.description.startsWith("player.media."), action).toBe(true);
    }
  });
});
