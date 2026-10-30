import { describe, expect, it } from "vitest";

import { resolveKeybinds, resolveScopeChords } from "@/lib/search/resolveHotkeys.utils";

function row(id: string) {
  const found = resolveKeybinds({}).find((entry) => entry.entry.id === id);
  if (!found) throw new Error(`missing manifest entry: ${id}`);
  return found;
}

describe("resolveKeybinds", () => {
  it("keeps defaults without overrides", () => {
    const resolved = row("tree.move.down");
    expect(resolved.activeChord).toBe("KeyJ");
    expect(resolved.overridden).toBe(false);
    expect(resolved.shadowedBy).toBeNull();
  });

  it("applies an override", () => {
    const resolved = resolveKeybinds({ "tree.move.down": "KeyX" }).find(
      (entry) => entry.entry.id === "tree.move.down"
    );
    expect(resolved?.activeChord).toBe("KeyX");
    expect(resolved?.overridden).toBe(true);
  });

  it("unbinds on null", () => {
    const resolved = resolveKeybinds({ "tree.move.down": null }).find(
      (entry) => entry.entry.id === "tree.move.down"
    );
    expect(resolved?.activeChord).toBeNull();
    expect(resolved?.overridden).toBe(true);
  });

  it("drops unknown ids and garbage chords", () => {
    const resolved = resolveKeybinds({
      "no.such.entry": "KeyX",
      "tree.move.down": "ctrl+ctrl",
    }).find((entry) => entry.entry.id === "tree.move.down");
    expect(resolved?.activeChord).toBe("KeyJ");
    expect(resolved?.overridden).toBe(false);
  });

  it("drops reserved prefix strokes", () => {
    const resolved = resolveKeybinds({ "tree.move.down": "KeyG" }).find(
      (entry) => entry.entry.id === "tree.move.down"
    );
    expect(resolved?.activeChord).toBe("KeyJ");
    expect(resolved?.overridden).toBe(false);
  });

  it("lets the later row win and unbinds the shadowed default", () => {
    const rows = resolveKeybinds({ "tree.move.up": "KeyJ" });
    const up = rows.find((entry) => entry.entry.id === "tree.move.up");
    const down = rows.find((entry) => entry.entry.id === "tree.move.down");
    expect(up?.activeChord).toBe("KeyJ");
    expect(down?.shadowedBy).toBe("tree.move.up");
    expect(down?.shadowedChord).toBe("KeyJ");
    expect(down?.activeChord).toBeNull();
  });

  it("leaves a loser unbound when its default is the contested chord", () => {
    const rows = resolveKeybinds({ "tree.move.down": "KeyX", "tree.move.up": "KeyX" });
    const down = rows.find((entry) => entry.entry.id === "tree.move.down");
    const up = rows.find((entry) => entry.entry.id === "tree.move.up");
    expect(up?.activeChord).toBe("KeyX");
    expect(down?.shadowedBy).toBe("tree.move.up");
    expect(down?.activeChord).toBe("KeyJ");
  });

  it("orders two overrides by object order", () => {
    const rows = resolveKeybinds({ "tree.move.down": "KeyT", "tree.move.up": "KeyT" });
    const down = rows.find((entry) => entry.entry.id === "tree.move.down");
    const up = rows.find((entry) => entry.entry.id === "tree.move.up");
    expect(up?.activeChord).toBe("KeyT");
    expect(down?.shadowedBy).toBe("tree.move.up");
    expect(down?.activeChord).toBe("KeyJ");
  });
});

describe("resolveScopeChords", () => {
  it("maps owned chords to entry ids", () => {
    const map = resolveScopeChords("tree", { "tree.move.down": "KeyX" });
    const ids = [...map.values()];
    expect(ids).toContain("tree.move.down");
    expect(map.size).toBeGreaterThan(0);
  });

  it("leaves unbound and shadowed rows out", () => {
    const map = resolveScopeChords("tree", {
      "tree.move.down": null,
      "tree.move.up": "KeyJ",
    });
    expect([...map.values()]).not.toContain("tree.move.down");
  });
});
