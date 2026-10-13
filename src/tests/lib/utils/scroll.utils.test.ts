import { afterEach, describe, expect, it } from "vitest";

import { closestScrollable, isInsideScrollable, scrollAmount } from "@/lib/utils/scroll.utils";

const created: HTMLElement[] = [];

function el(tag = "div", props: Record<string, unknown> = {}): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(node, key, { value, configurable: true });
  }
  document.body.append(node);
  created.push(node);
  return node;
}

afterEach(() => {
  for (const node of created.splice(0)) node.remove();
});

function makeScrollable(node: HTMLElement, scroll = 200, client = 100): HTMLElement {
  Object.defineProperty(node, "scrollHeight", { value: scroll, configurable: true });
  Object.defineProperty(node, "clientHeight", { value: client, configurable: true });
  return node;
}

describe("closestScrollable", () => {
  it("returns the element itself when it overflows", () => {
    const node = makeScrollable(el());
    expect(closestScrollable(node)).toBe(node);
  });

  it("returns the nearest overflowing ancestor", () => {
    const outer = makeScrollable(el());
    const inner = el();
    outer.append(inner);
    expect(closestScrollable(inner)).toBe(outer);
  });

  it("treats a data-playlist-scroll container as a scroll surface", () => {
    const node = el("div", {});
    node.dataset.playlistScroll = "";
    const inner = el("span");
    node.append(inner);
    expect(closestScrollable(inner)).toBe(node);
  });

  it("skips past data-no-wheel nodes", () => {
    const blocked = el();
    blocked.dataset.noWheel = "";
    makeScrollable(blocked);
    const inner = el("span");
    blocked.append(inner);
    expect(closestScrollable(inner)).toBe(null);
  });

  it("returns null without a scrollable ancestor", () => {
    const inner = el("span");
    el().append(inner);
    expect(closestScrollable(inner)).toBe(null);
  });

  it("returns null for a non-element target", () => {
    expect(closestScrollable(null)).toBe(null);
  });
});

describe("scrollAmount", () => {
  it("steps one line in each direction", () => {
    expect(scrollAmount("down", 800, 60)).toBe(60);
    expect(scrollAmount("up", 800, 60)).toBe(-60);
  });

  it("steps half the viewport for page moves", () => {
    expect(scrollAmount("half.down", 800, 60)).toBe(400);
    expect(scrollAmount("half.up", 800, 60)).toBe(-400);
  });

  it("never drops a half step below one line", () => {
    expect(scrollAmount("half.down", 40, 60)).toBe(60);
  });
});

describe("isInsideScrollable", () => {
  it("is false for a non-element target", () => {
    expect(isInsideScrollable(null)).toBe(false);
  });

  it("is true inside a plain overflowing element", () => {
    const node = makeScrollable(el());
    expect(isInsideScrollable(node)).toBe(true);
  });

  it("is true inside a playlist scroll container", () => {
    const node = el();
    node.dataset.playlistScroll = "";
    expect(isInsideScrollable(node)).toBe(true);
  });

  it("is false over a plain element", () => {
    expect(isInsideScrollable(el())).toBe(false);
  });
});
