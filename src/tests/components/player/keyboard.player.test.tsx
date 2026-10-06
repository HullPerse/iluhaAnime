import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Keyboard from "@/routes/components/player/media/keyboard.player";

function fireWheel(target: Element, deltaY: number): void {
  target.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true }));
}

afterEach(() => {
  cleanup();
});

describe("Keyboard wheel", () => {
  it("ignores wheel events inside the playlist scroll container", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const scroller = document.createElement("div");
    scroller.dataset.playlistScroll = "";
    const inner = document.createElement("span");
    inner.textContent = "row";
    scroller.append(inner);
    document.body.append(scroller);
    try {
      fireWheel(inner, 100);
      expect(onWheel).not.toHaveBeenCalled();
    } finally {
      scroller.remove();
    }
  });

  it("ignores wheel events inside data-no-wheel containers", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const panel = document.createElement("div");
    panel.dataset.noWheel = "";
    const inner = document.createElement("span");
    panel.append(inner);
    document.body.append(panel);
    try {
      fireWheel(inner, 100);
      expect(onWheel).not.toHaveBeenCalled();
    } finally {
      panel.remove();
    }
  });

  it("ignores wheel events inside any vertically scrollable element", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollHeight", { value: 200, configurable: true });
    Object.defineProperty(scroller, "clientHeight", { value: 100, configurable: true });
    const inner = document.createElement("span");
    scroller.append(inner);
    document.body.append(scroller);
    try {
      fireWheel(inner, 100);
      expect(onWheel).not.toHaveBeenCalled();
    } finally {
      scroller.remove();
    }
  });

  it("changes volume on wheel over plain elements", () => {
    const onWheel = vi.fn();
    render(<Keyboard onAction={() => undefined} onWheel={onWheel} />);
    const plain = document.createElement("div");
    document.body.append(plain);
    try {
      fireWheel(plain, 100);
      expect(onWheel).toHaveBeenCalledWith(-1);
      fireWheel(plain, -100);
      expect(onWheel).toHaveBeenCalledWith(1);
    } finally {
      plain.remove();
    }
  });
});
