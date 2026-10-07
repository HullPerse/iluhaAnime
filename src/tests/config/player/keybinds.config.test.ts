import { describe, expect, it } from "vitest";

import { KEYBINDS, PLAYER_HOTKEYS } from "@/config/player/keybinds.config";
import { parseChord } from "@/lib/hotkeys/chord.hotkeys";
import { createHotkeyRegistry } from "@/lib/hotkeys/registry.hotkeys";

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
    const repeatOf = (action: string) => KEYBINDS.find((keybind) => keybind.action === action)?.repeat;
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
