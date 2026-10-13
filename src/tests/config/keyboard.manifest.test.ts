import { describe, expect, it } from "vitest";

import { KEYBIND_MANIFEST, keybindEntriesByScope } from "@/config/keyboard/manifest.config";
import { KEYBINDS } from "@/config/player/keybinds.config";
import { chordKey, parseChord } from "@/lib/hotkeys/chord.hotkeys";
import en from "@/lib/locale/en";
import ru from "@/lib/locale/ru";

const EN: Record<string, string> = en;
const RU: Record<string, string> = ru;

describe("keybind manifest", () => {
  it("parses every chord", () => {
    for (const entry of KEYBIND_MANIFEST) {
      expect(parseChord(entry.chord), `${entry.id} (${entry.chord})`).toBeTruthy();
    }
  });

  it("uses a unique id per entry", () => {
    const seen = new Set<string>();
    for (const entry of KEYBIND_MANIFEST) {
      expect(seen.has(entry.id), `duplicate id ${entry.id}`).toBe(false);
      seen.add(entry.id);
    }
  });

  it("never binds the same chord twice inside one scope", () => {
    const seen = new Map<string, string>();
    for (const entry of KEYBIND_MANIFEST) {
      const chord = parseChord(entry.chord);
      if (!chord) continue;
      const key = `${entry.scope}:${chordKey(chord)}`;
      const clash = seen.get(key);
      expect(clash, `${entry.id} clashes with ${clash} in ${entry.scope}`).toBeUndefined();
      seen.set(key, entry.id);
    }
  });

  it("keeps the bare vim trigger and the modified page find apart", () => {
    const vim = KEYBIND_MANIFEST.find((entry) => entry.id === "vim.hints");
    const find = KEYBIND_MANIFEST.find((entry) => entry.id === "page.find");
    expect(vim?.chord).toBe("KeyF");
    expect(find?.chord).toBe("ctrl+KeyF");
  });

  it("resolves every description in both dictionaries", () => {
    for (const entry of KEYBIND_MANIFEST) {
      expect(EN[entry.description], `en ${entry.description}`).toBeTruthy();
      expect(RU[entry.description], `ru ${entry.description}`).toBeTruthy();
    }
  });

  it("mirrors the player keybinds", () => {
    expect(keybindEntriesByScope("player").map((entry) => entry.chord)).toEqual(
      KEYBINDS.map((keybind) => keybind.chord)
    );
  });

  it("lists the vim commands as vim-mode entries", () => {
    const vimEntries = keybindEntriesByScope("vim");
    expect(vimEntries.length).toBeGreaterThan(0);
    expect(vimEntries.every((entry) => entry.mode === "vim")).toBe(true);
  });
});
