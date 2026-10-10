import { bench, group } from "@pmndrs/labs";
// Hotkey chord parsing, registry building, and key dispatch. Dispatch
// runs on every keydown, so the per-event cost is the number to pin.
// KeyboardEvent is unavailable under node, so dispatch is measured at
// the registry Map level with precomputed chord key strings.
// Budget (avg/iter, Ryzen 7 5800X/node 26, 2026-10-08): parse 9.2ms,
// registry build 33us, dispatch hits 271us, misses 183us. Regression
// threshold is labs minDelta 5%.

import { chordKey, parseChord } from "../../src/lib/hotkeys/chord.hotkeys";
import { createHotkeyRegistry } from "../../src/lib/hotkeys/registry.hotkeys";

const CHORDS = [
  "ctrl+KeyS",
  "ctrl+KeyO",
  "ctrl+Shift+KeyP",
  "alt+ArrowLeft",
  "alt+ArrowRight",
  "Space",
  "KeyF",
  "Escape",
  "Shift+Slash",
  "ctrl+KeyF",
  "KeyM",
  "KeyG",
  "ctrl+KeyZ",
  "ctrl+Shift+KeyZ",
  "alt+Digit1",
  "alt+Digit2",
  "ctrl+ArrowUp",
  "ctrl+ArrowDown",
  "KeyP",
  "Shift+KeyN",
];

function makeDefs(count: number): Array<{ id: string; chord: string; repeat: "once" | "hold" }> {
  const out: Array<{ id: string; chord: string; repeat: "once" | "hold" }> = [];
  for (let i = 0; i < count; i++) {
    const mods = i % 4 === 0 ? "ctrl+" : i % 4 === 1 ? "alt+" : i % 4 === 2 ? "ctrl+Shift+" : "";
    out.push({
      chord: `${mods}Key${String(i).padStart(2, "0")}`,
      id: `action-${i}`,
      repeat: i % 2 === 0 ? "once" : "hold",
    });
  }
  return out;
}

const DEFS_40 = makeDefs(40);
const REGISTRY = createHotkeyRegistry(DEFS_40);
const HIT_KEYS = [...REGISTRY.keys()];
const MISS_KEYS = [
  "KeyZ:false:false:false:false",
  "F9:false:false:false:false",
  "KeyX:true:true:true:true",
];

group("hotkeys @hotkeys @quick", () => {
  bench("parse 20 chords x2k", () => {
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      for (const chord of CHORDS) {
        const parsed = parseChord(chord);
        sum += parsed ? chordKey(parsed).length : 0;
      }
    }
    return sum;
  });

  bench("build registry 40 defs", () => {
    return createHotkeyRegistry(DEFS_40).size;
  });

  bench("dispatch hits 40 keys x1k", () => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      for (const key of HIT_KEYS) {
        const hit = REGISTRY.get(key);
        sum += hit ? hit.id.length : 0;
      }
    }
    return sum;
  });

  bench("dispatch misses x10k", () => {
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      for (const key of MISS_KEYS) {
        if (REGISTRY.get(key) === undefined) sum += 1;
      }
    }
    return sum;
  });
});
