import { describe, expect, it } from "vitest";

import {
  DRAG_THRESHOLD_PX,
  shouldStartWindowDrag,
  startsOnPlayerControl,
} from "@/lib/player/playerDrag.utils";

describe("shouldStartWindowDrag", () => {
  it("keeps a plain click a click", () => {
    expect(shouldStartWindowDrag(100, 100, 100, 100)).toBe(false);
    expect(shouldStartWindowDrag(100, 100, 103, 102)).toBe(false);
  });

  it("starts the drag once either axis passes the threshold", () => {
    expect(shouldStartWindowDrag(100, 100, 100 + DRAG_THRESHOLD_PX, 100)).toBe(true);
    expect(shouldStartWindowDrag(100, 100, 100, 100 - DRAG_THRESHOLD_PX)).toBe(true);
    expect(shouldStartWindowDrag(100, 100, 90, 100)).toBe(true);
  });

  it("accepts a custom threshold", () => {
    expect(shouldStartWindowDrag(0, 0, 3, 0, 2)).toBe(true);
    expect(shouldStartWindowDrag(0, 0, 3, 0, 4)).toBe(false);
  });
});

describe("startsOnPlayerControl", () => {
  it("detects presses that land on an interactive control", () => {
    const wrapper = document.createElement("div");
    const button = document.createElement("button");
    const label = document.createElement("span");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    wrapper.append(button, label, dialog);

    expect(startsOnPlayerControl(button)).toBe(true);
    expect(startsOnPlayerControl(button.querySelector("b"))).toBe(false);
    expect(startsOnPlayerControl(label)).toBe(false);
    expect(startsOnPlayerControl(dialog)).toBe(true);
    expect(startsOnPlayerControl(null)).toBe(false);
  });
});
