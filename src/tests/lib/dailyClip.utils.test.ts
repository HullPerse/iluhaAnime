import { describe, expect, it } from "vitest";

import { clipEnd, clipStart, windowSecondsFor } from "@/lib/daily/clip.utils";

describe("daily clip windows", () => {
  it("grows 3, 6, 10, 15 and then the full clip", () => {
    const windows = Array.from({ length: 5 }, (_, attempts) => windowSecondsFor(attempts, 5));
    expect(windows).toEqual([3, 6, 10, 15, null]);
  });

  it("keeps the widest window before the outro", () => {
    const start = clipStart(100, 0.9);
    expect(start).toBeCloseTo(77, 6);
    expect(clipEnd(100, start, 15)).toBeCloseTo(92, 6);
    expect(clipEnd(100, start, null)).toBeCloseTo(92, 6);
  });

  it("never opens before the opening margin", () => {
    expect(clipStart(100, 0)).toBe(15);
    expect(clipStart(100, 0.3)).toBe(30);
  });

  it("handles clips shorter than the widest window", () => {
    const start = clipStart(10, 0.7);
    expect(start).toBeCloseTo(1.5, 6);
    expect(clipEnd(10, start, 15)).toBeCloseTo(9.2, 6);
  });
});
