import { describe, expect, it } from "vitest";

import {
  isKeyboardNeighbor,
  keyboardSubstitutionCost,
  keyboardWordDistance,
} from "@/lib/search/keyboard.utils";

describe("search/keyboard neighbors", () => {
  it("treats adjacent QWERTY keys as neighbors", () => {
    expect(isKeyboardNeighbor("e", "r")).toBe(true);
    expect(isKeyboardNeighbor("5", "r")).toBe(true);
    expect(isKeyboardNeighbor("a", "s")).toBe(true);
  });

  it("rejects far keys and unknown symbols", () => {
    expect(isKeyboardNeighbor("e", "p")).toBe(false);
    expect(isKeyboardNeighbor("5", "k")).toBe(false);
    expect(isKeyboardNeighbor("e", "?")).toBe(false);
  });

  it("charges less for a neighbor substitution", () => {
    expect(keyboardSubstitutionCost("5", "r")).toBe(0.4);
    expect(keyboardSubstitutionCost("5", "k")).toBe(1);
    expect(keyboardSubstitutionCost("e", "e")).toBe(0);
  });
});

describe("search/keyboard word distance", () => {
  it("is zero for equal words", () => {
    expect(keyboardWordDistance("beer", "beer")).toBe(0);
  });

  it("prefers the neighbor-key candidate at equal edit distance", () => {
    expect(keyboardWordDistance("bee5", "beer")).toBeLessThan(keyboardWordDistance("bee5", "beek"));
  });
});
