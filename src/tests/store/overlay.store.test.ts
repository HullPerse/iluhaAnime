import { describe, expect, it } from "vitest";

import { dismissTopOverlay, overlayAtoms, registerOverlay } from "@/store/overlay.store";

function depth(): number {
  return overlayAtoms.entries.get().length;
}

describe("overlay store", () => {
  it("stacks registrations and dismisses from the top", () => {
    const start = depth();
    const calls: string[] = [];
    const unregisterFirst = registerOverlay(() => {
      calls.push("first");
    });
    const unregisterSecond = registerOverlay(() => {
      calls.push("second");
    });
    expect(depth()).toBe(start + 2);
    expect(dismissTopOverlay()).toBe(true);
    expect(calls).toEqual(["second"]);
    expect(depth()).toBe(start + 2);
    unregisterSecond();
    expect(depth()).toBe(start + 1);
    expect(dismissTopOverlay()).toBe(true);
    expect(calls).toEqual(["second", "first"]);
    unregisterFirst();
    expect(depth()).toBe(start);
  });

  it("supports entries without a dismiss handler", () => {
    const start = depth();
    const unregister = registerOverlay(null);
    expect(depth()).toBe(start + 1);
    expect(dismissTopOverlay()).toBe(false);
    expect(depth()).toBe(start + 1);
    unregister();
    expect(depth()).toBe(start);
  });
});
