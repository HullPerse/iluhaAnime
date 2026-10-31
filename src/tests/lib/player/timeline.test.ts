import { describe, expect, it } from "vitest";

import { bufferedSpan, isBuffered } from "@/lib/player/timeline.utils";

describe("bufferedSpan", () => {
  it("uses the cache timestamps and keeps the back buffer behind the playhead", () => {
    expect(bufferedSpan(280, 1400, 210, 350, undefined)).toEqual({ start: 210, end: 350 });
  });

  it("falls back to the playhead plus the reported cache duration", () => {
    expect(bufferedSpan(280, 1400, undefined, undefined, 140)).toEqual({
      start: 280,
      end: 420,
    });
  });

  it("clamps a span that runs past the end of the media", () => {
    expect(bufferedSpan(1330, 1400, 1330, 1530, undefined)).toEqual({
      start: 1330,
      end: 1400,
    });
  });

  it("drops a span that would paint nothing", () => {
    expect(bufferedSpan(280, 1400, 280, 280, undefined)).toBeNull();
    expect(bufferedSpan(280, 1400, 300, 200, undefined)).toBeNull();
    expect(bufferedSpan(280, 1400, undefined, undefined, 0)).toBeNull();
  });

  it("has no span without a duration", () => {
    expect(bufferedSpan(0, 0, 0, 100, 40)).toBeNull();
  });
});

describe("isBuffered", () => {
  const span = { start: 210, end: 350 };

  it("accepts a seek inside the span", () => {
    expect(isBuffered(span, 280)).toBe(true);
  });

  it("tolerates a seek on the edge", () => {
    expect(isBuffered(span, 210.4)).toBe(true);
    expect(isBuffered(span, 350.4)).toBe(true);
  });

  it("rejects a seek outside the span", () => {
    expect(isBuffered(span, 100)).toBe(false);
    expect(isBuffered(span, 500)).toBe(false);
  });

  it("rejects everything without a span", () => {
    expect(isBuffered(null, 280)).toBe(false);
  });
});
