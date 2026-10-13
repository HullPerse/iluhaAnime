import { describe, expect, it } from "vitest";

import { DEFAULT_PLAYER_SPEED, PLAYER_SPEEDS, stepSpeed } from "@/lib/player/speed.utils";

const SLOWEST = PLAYER_SPEEDS.at(0) ?? DEFAULT_PLAYER_SPEED;
const FASTEST = PLAYER_SPEEDS.at(-1) ?? DEFAULT_PLAYER_SPEED;

describe("player/speed steps", () => {
  it("walks the list one step at a time", () => {
    expect(stepSpeed(1, 1)).toBe(1.25);
    expect(stepSpeed(1, -1)).toBe(0.75);
    expect(stepSpeed(0.5, 1)).toBe(0.75);
    expect(stepSpeed(2, -1)).toBe(1.5);
  });

  it("clamps instead of wrapping at either end", () => {
    expect(stepSpeed(SLOWEST, -1)).toBe(SLOWEST);
    expect(stepSpeed(FASTEST, 1)).toBe(FASTEST);
  });

  it("resets to the default on direction 0", () => {
    expect(stepSpeed(0.5, 0)).toBe(DEFAULT_PLAYER_SPEED);
    expect(stepSpeed(2, 0)).toBe(DEFAULT_PLAYER_SPEED);
  });

  it("snaps a speed outside the list to the nearest step first", () => {
    // 1.1 sits closer to 1 than to 1.25, so it steps from 1 in both directions.
    expect(stepSpeed(1.1, 1)).toBe(1.25);
    expect(stepSpeed(1.1, -1)).toBe(0.75);
    expect(stepSpeed(0.1, 1)).toBe(0.75);
    expect(stepSpeed(9, 1)).toBe(FASTEST);
  });

  it("keeps the list ascending and unique", () => {
    const sorted = [...PLAYER_SPEEDS].sort((left, right) => left - right);
    expect(PLAYER_SPEEDS).toEqual(sorted);
    expect(new Set(PLAYER_SPEEDS).size).toBe(PLAYER_SPEEDS.length);
  });
});
