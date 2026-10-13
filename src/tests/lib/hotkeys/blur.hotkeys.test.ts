import { describe, expect, it } from "vitest";

import type { BlurGate } from "@/lib/hotkeys/blur.hotkeys";
import { blurEditable, shouldBlurOnEscape } from "@/lib/hotkeys/blur.hotkeys";

function makeElement(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

const OPEN_GATE: BlurGate = {
  vimMode: true,
  excludedRoute: false,
  hintsOpen: false,
  topLayer: null,
};

describe("shouldBlurOnEscape", () => {
  const BLURRED: Array<[tag: string, attrs?: Record<string, string>]> = [
    ["input"],
    ["textarea"],
    ["select"],
    ["button"],
    ["div", { contenteditable: "true" }],
  ];

  it("blurs focused controls that swallow vim chords", () => {
    for (const [tag, attrs] of BLURRED) {
      expect(shouldBlurOnEscape(makeElement(tag, attrs), OPEN_GATE), tag).toBe(true);
    }
  });

  it("leaves hidden inputs and plain elements alone", () => {
    expect(shouldBlurOnEscape(makeElement("input", { type: "hidden" }), OPEN_GATE)).toBe(false);
    expect(shouldBlurOnEscape(makeElement("div"), OPEN_GATE)).toBe(false);
    expect(shouldBlurOnEscape(document.body, OPEN_GATE)).toBe(false);
  });

  it("keeps priority for the mode gate, the player, hints, and layers", () => {
    const input = makeElement("input");
    const layer = makeElement("div");
    expect(shouldBlurOnEscape(input, { ...OPEN_GATE, vimMode: false })).toBe(false);
    expect(shouldBlurOnEscape(input, { ...OPEN_GATE, excludedRoute: true })).toBe(false);
    expect(shouldBlurOnEscape(input, { ...OPEN_GATE, hintsOpen: true })).toBe(false);
    expect(shouldBlurOnEscape(input, { ...OPEN_GATE, topLayer: layer })).toBe(false);
  });

  it("returns false for non-element targets", () => {
    expect(shouldBlurOnEscape(null, OPEN_GATE)).toBe(false);
    expect(shouldBlurOnEscape(document, OPEN_GATE)).toBe(false);
  });
});

describe("blurEditable", () => {
  it("drops focus from the element", () => {
    const node = document.createElement("input");
    document.body.append(node);
    node.focus();
    expect(document.activeElement).toBe(node);
    blurEditable(node);
    expect(document.activeElement).not.toBe(node);
    node.remove();
  });

  it("ignores a non-element target", () => {
    expect(() => blurEditable(null)).not.toThrow();
  });
});
