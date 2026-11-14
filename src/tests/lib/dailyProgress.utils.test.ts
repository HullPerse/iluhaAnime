import { describe, expect, it } from "vitest";

import { clipMegabytes, clipProgressPercent } from "@/lib/daily/progress.utils";

describe("clipProgressPercent", () => {
  it("rounds the received share", () => {
    expect(clipProgressPercent(13_002_342, 29_464_986)).toBe(44);
  });

  it("clamps to 0..100 and rejects a zero total", () => {
    expect(clipProgressPercent(-5, 100)).toBe(0);
    expect(clipProgressPercent(120, 100)).toBe(100);
    expect(clipProgressPercent(10, 0)).toBe(0);
    expect(clipProgressPercent(Number.NaN, 100)).toBe(0);
  });
});

describe("clipMegabytes", () => {
  it("formats one decimal place", () => {
    expect(clipMegabytes(13_002_342)).toBe("12.4");
    expect(clipMegabytes(29_464_986)).toBe("28.1");
    expect(clipMegabytes(0)).toBe("0.0");
  });

  it("never returns a negative size", () => {
    expect(clipMegabytes(-1024)).toBe("0.0");
  });
});
