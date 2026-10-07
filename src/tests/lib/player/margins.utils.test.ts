import { describe, expect, it } from "vitest";

import {
  computeVideoMargins,
  marginOptions,
  marginsCloseEnough,
} from "@/lib/player/margins.utils";

describe("computeVideoMargins", () => {
  it("converts all four field insets into fractions of the viewport", () => {
    expect(
      computeVideoMargins(1000, 1000, { left: 80, top: 30, right: 1000, bottom: 940 })
    ).toEqual({ top: 0.03, bottom: 0.06, left: 0.08, right: 0 });
  });

  it("clamps overhanging rects to [0, 1] instead of emitting invalid margins", () => {
    expect(
      computeVideoMargins(1000, 1000, { left: -50, top: -50, right: 1200, bottom: 1200 })
    ).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it("can measure a field that reaches the right edge", () => {
    expect(
      computeVideoMargins(1280, 720, { left: 4, top: 28, right: 1280, bottom: 660 })
    ).toEqual({ top: 28 / 720, bottom: 60 / 720, left: 4 / 1280, right: 0 });
  });

  it("falls back to zero margins without a measured rect or viewport", () => {
    expect(computeVideoMargins(1000, 1000, undefined)).toEqual({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    expect(
      computeVideoMargins(0, 0, { left: 10, top: 10, right: 20, bottom: 20 })
    ).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe("marginsCloseEnough", () => {
  const base = { top: 0.03, bottom: 0.06, left: 0.08, right: 0.1 };

  it("treats sub-pixel drift as unchanged to avoid IPC spam", () => {
    expect(
      marginsCloseEnough(base, { top: 0.0305, bottom: 0.0605, left: 0.0805, right: 0.1005 })
    ).toBe(true);
  });

  it("detects a change on any side", () => {
    expect(marginsCloseEnough(base, { ...base, left: 0.2 })).toBe(false);
    expect(marginsCloseEnough(base, { ...base, right: 0 })).toBe(false);
  });
});

describe("marginOptions", () => {
  it("maps margins onto mpv option names", () => {
    expect(marginOptions({ top: 0.03, bottom: 0.06, left: 0.08, right: 0.1 })).toEqual({
      "video-margin-ratio-top": 0.03,
      "video-margin-ratio-bottom": 0.06,
      "video-margin-ratio-left": 0.08,
      "video-margin-ratio-right": 0.1,
    });
  });
});
