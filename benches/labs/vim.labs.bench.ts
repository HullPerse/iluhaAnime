import { bench, group } from "@pmndrs/labs";
// Vim keyboard mode. Three hot paths, one bench each:
//   open   -> scanHintTargets over the whole document (per `F`)
//   key    -> reduceHintKey over every open badge (per keystroke)
//   frame  -> measureBadgeLayouts over every open badge (per scroll/resize/mutation)
//   frame  -> resolveBadgeCollisions over every layout (per frame, after measure)
// The mode only runs in a browser, but the passes themselves are plain JS:
// element lookup and rect reads are replaced with deterministic fakes here,
// so these numbers are the JavaScript overhead of the traversal, label and
// matching passes. Browser layout cost is NOT included and must be checked
// in a live run.
// Budget (median/iter, Ryzen 7 5800X/node 26, 2026-10-12, one measurement):
//   assign labels 380            29 us
//   scan 380 hintable            40 us
//   scan 3000 candidates         86 us   <- fakes, no layout reads
//   match label miss (380)      1.5 us / keystroke
//   match label hit (380)       6.8 ns
//   measure 380 layouts          25 us   <- fakes, no layout reads
//   resolve 380 collisions      102 us   <- fakes, after measure, per frame
//   compare 380 layouts         4.6 us
//   command table build         2.6 us
//   dispatch hit               4.9 ns / lookup
//   scroll step                1.1 ns
// Every JS pass is far inside a 16.7 ms frame; the browser-side
// getBoundingClientRect cost of the scan and the measure is NOT measured
// here and needs a live run. Regression threshold is labs minDelta 5%.

import { VIM_LABEL_ALPHABET } from "../../src/config/settings/vim.config";
import { createVimCommandTable } from "../../src/lib/core/engineHotkeys.utils";
import {
  assignLabels,
  hintLayoutsEqual,
  labelCapacity,
  measureBadgeLayouts,
  reduceHintKey,
  resolveBadgeCollisions,
  scanHintTargets,
} from "../../src/lib/core/hintsHotkeys.utils";
import type { HintBadge } from "../../src/types/core/hintsHotkeys";
import { scrollAmount } from "../../src/lib/ui/scroll.utils";

// The scanner reads the viewport through `window`; node has none.
(globalThis as { window?: unknown }).window = { innerWidth: 1920, innerHeight: 1080 };
// The focus-target check uses element constructors; the labs runtime has
// none, and the fakes are plain objects (never instances), so one shared
// stub keeps the scan benches on the plain-button path.
class LabsDomStub {
  readonly stub = true as const;
}
for (const name of ["HTMLTextAreaElement", "HTMLSelectElement", "HTMLInputElement"] as const) {
  if ((globalThis as Record<string, unknown>)[name] === undefined) {
    (globalThis as Record<string, unknown>)[name] = LabsDomStub;
  }
}

function fakeElement(index: number): HTMLElement {
  const top = (index % 40) * 24;
  const left = (index % 8) * 120;
  return {
    dataset: {},
    isConnected: true,
    getBoundingClientRect: () => ({
      top,
      left,
      bottom: top + 20,
      right: left + 100,
      width: 100,
      height: 20,
      x: left,
      y: top,
    }),
    getAttribute: () => null,
    hasAttribute: () => false,
    closest: () => null,
    matches: () => false,
  } as unknown as HTMLElement;
}

function fakeRoot(elements: HTMLElement[]): ParentNode {
  return { querySelectorAll: () => elements } as unknown as ParentNode;
}

const CAPACITY = labelCapacity(VIM_LABEL_ALPHABET, 2);

function makeElements(count: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let i = 0; i < count; i++) out.push(fakeElement(i));
  return out;
}

function makeBadges(count: number): HintBadge[] {
  const elements = makeElements(count);
  const labels = assignLabels(count, VIM_LABEL_ALPHABET, 2);
  const out: HintBadge[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ element: elements[i]!, label: labels[i]!, variant: "plain" });
  }
  return out;
}

const ELEMENTS_FULL = makeElements(CAPACITY);
const ELEMENTS_OVER = makeElements(3000);
const BADGES = makeBadges(CAPACITY);
const LAYOUTS = measureBadgeLayouts(BADGES, null, () => "");
// "z" is not in the alphabet, so this is the worst case for label matching.
const MISS = "z";

const TABLE = createVimCommandTable();
const HIT_KEYS = [
  "KeyF:false:false:false:false",
  "KeyJ:false:false:false:false",
  "KeyK:false:false:false:false",
  "KeyD:false:false:false:false",
  "KeyU:false:false:false:false",
];
const MISS_KEYS = ["KeyZ:false:false:false:false", "KeyG:true:false:false:false"];

group("vim @vim @quick", () => {
  bench("assign labels 380 x100", () => {
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += assignLabels(CAPACITY, VIM_LABEL_ALPHABET, 2).length;
    return sum;
  });

  bench("scan 380 hintable x100", () => {
    const root = fakeRoot(ELEMENTS_FULL);
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += scanHintTargets(root).badges.length;
    return sum;
  });

  bench("scan 3000 candidates (caps at 380) x20", () => {
    const root = fakeRoot(ELEMENTS_OVER);
    let sum = 0;
    for (let i = 0; i < 20; i++) {
      const result = scanHintTargets(root);
      sum += result.badges.length + result.overflow;
    }
    return sum;
  });

  bench("match label miss 380 badges x1k", () => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += reduceHintKey(BADGES, "", MISS, false).outcome.length;
    return sum;
  });

  bench("match label hit 380 badges x1k", () => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      sum += reduceHintKey(BADGES, "", VIM_LABEL_ALPHABET[0]!, false).outcome.length;
    }
    return sum;
  });

  bench("measure 380 badge layouts x100", () => {
    const seen = { count: 0 };
    for (let i = 0; i < 100; i++) seen.count += measureBadgeLayouts(BADGES, null, () => "").length;
    return seen.count;
  });

  bench("compare 380 badge layouts x1k", () => {
    let hits = 0;
    for (let i = 0; i < 1000; i++) if (hintLayoutsEqual(LAYOUTS, LAYOUTS)) hits += 1;
    return hits;
  });

  bench("resolve 380 badge collisions x100", () => {
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += resolveBadgeCollisions(LAYOUTS).length;
    return sum;
  });

  bench("engine command table build x1k", () => {
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += createVimCommandTable().size;
    return sum;
  });

  bench("engine dispatch hits x10k", () => {
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      for (const key of HIT_KEYS) sum += (TABLE.get(key) ?? "").length;
    }
    return sum;
  });

  bench("engine dispatch misses x10k", () => {
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      for (const key of MISS_KEYS) if (TABLE.get(key) === undefined) sum += 1;
    }
    return sum;
  });

  bench("scroll step x100k", () => {
    let sum = 0;
    for (let i = 0; i < 100_000; i++) {
      sum += scrollAmount(i % 2 === 0 ? "down" : "half.up", 800, 60);
    }
    return sum;
  });
});
