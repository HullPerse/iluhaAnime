import { describe, expect, it } from "vitest";

import { shouldIgnoreHotkeys } from "@/lib/hotkeys/filter.hotkeys";

function makeElement(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

describe("shouldIgnoreHotkeys", () => {
  const IGNORED: Array<[tag: string, attrs?: Record<string, string>]> = [
    ["input"],
    ["textarea"],
    ["select"],
    ["button"],
    ["div", { contenteditable: "true" }],
    ["div", { "data-no-hotkeys": "" }],
    ["div", { "data-hotkeys-disabled": "" }],
    ["div", { "data-no-wheel": "" }],
  ];

  it("ignores every selector member of the hotkey ignore list", () => {
    for (const [tag, attrs] of IGNORED) {
      expect(shouldIgnoreHotkeys(makeElement(tag, attrs)), tag).toBe(true);
    }
  });

  it("walks up the ancestor tree via closest", () => {
    const wrapper = makeElement("div", { "data-no-hotkeys": "" });
    const inner = makeElement("span");
    wrapper.append(inner);
    expect(shouldIgnoreHotkeys(inner)).toBe(true);
  });

  it("accepts events on plain elements", () => {
    expect(shouldIgnoreHotkeys(makeElement("div"))).toBe(false);
    expect(shouldIgnoreHotkeys(makeElement("div", { contenteditable: "false" }))).toBe(false);
  });

  it("returns false for non-element targets", () => {
    expect(shouldIgnoreHotkeys(null)).toBe(false);
    expect(shouldIgnoreHotkeys(document)).toBe(false);
    expect(shouldIgnoreHotkeys(document.createTextNode("x"))).toBe(false);
  });
});
