import { afterEach, describe, expect, it } from "vitest";

import { scanHintTargets } from "@/lib/hotkeys/hints.hotkeys";
import {
  isInsideLayer,
  setHintsLayerVisible,
  topLayerElement,
  VIM_HINTS_OPEN_CLASS,
} from "@/lib/hotkeys/layer.hotkeys";

const nodes: HTMLElement[] = [];

function box(node: HTMLElement, rect: Partial<DOMRect> = {}): HTMLElement {
  const full = {
    top: 10,
    left: 10,
    bottom: 30,
    right: 60,
    width: 50,
    height: 20,
    x: 10,
    y: 10,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  node.getBoundingClientRect = () => full;
  return node;
}

function layer(role: string, rect: Partial<DOMRect> = {}): HTMLElement {
  const node = box(document.createElement("div"), rect);
  node.setAttribute("role", role);
  document.body.append(node);
  nodes.push(node);
  return node;
}

function control(parent: HTMLElement = document.body): HTMLElement {
  const node = box(document.createElement("button"));
  parent.append(node);
  if (parent === document.body) nodes.push(node);
  return node;
}

const CLOSED: Partial<DOMRect> = { width: 0, height: 0, right: 10, bottom: 10 };

afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
});

describe("topLayerElement", () => {
  it("returns null while nothing is open", () => {
    expect(topLayerElement()).toBeNull();
  });

  it("takes the last visible layer as the top of the stack", () => {
    const dialog = layer("dialog");
    const menu = layer("menu");
    expect(topLayerElement()).toBe(menu);
    expect(topLayerElement()).not.toBe(dialog);
  });

  it("skips a closed layer", () => {
    const open = layer("dialog");
    layer("menu", CLOSED);
    expect(topLayerElement()).toBe(open);
  });

  it("recognises Base UI content slots and hand-marked layers", () => {
    const slot = box(document.createElement("div"));
    slot.dataset.slot = "dropdown-menu-content";
    document.body.append(slot);
    nodes.push(slot);
    expect(topLayerElement()).toBe(slot);

    const marked = box(document.createElement("div"));
    marked.dataset.vimLayer = "";
    document.body.append(marked);
    nodes.push(marked);
    expect(topLayerElement()).toBe(marked);
  });
});

describe("isInsideLayer", () => {
  it("accepts the layer and its controls, rejects the page", () => {
    const dialog = layer("dialog");
    const inside = control(dialog);
    const page = control();

    expect(isInsideLayer(dialog, dialog)).toBe(true);
    expect(isInsideLayer(inside, dialog)).toBe(true);
    expect(isInsideLayer(page, dialog)).toBe(false);
    expect(isInsideLayer(page, null)).toBe(false);
  });
});

describe("scoped hint scan", () => {
  it("labels only the controls of the top layer", () => {
    const behind = control();
    const dialog = layer("dialog");
    const inside = control(dialog);

    const top = topLayerElement();
    expect(top).toBe(dialog);
    if (!top) throw new Error("layer missing");

    const found = scanHintTargets(top).badges.map((badge) => badge.element);
    expect(found).toEqual([inside]);
    expect(found).not.toContain(behind);
  });
});

describe("setHintsLayerVisible", () => {
  it("toggles the body class for the layer duration", () => {
    try {
      expect(document.body.classList.contains(VIM_HINTS_OPEN_CLASS)).toBe(false);
      setHintsLayerVisible(true);
      expect(document.body.classList.contains(VIM_HINTS_OPEN_CLASS)).toBe(true);
      setHintsLayerVisible(true);
      expect(document.body.classList.contains(VIM_HINTS_OPEN_CLASS)).toBe(true);
      setHintsLayerVisible(false);
      expect(document.body.classList.contains(VIM_HINTS_OPEN_CLASS)).toBe(false);
    } finally {
      setHintsLayerVisible(false);
    }
  });
});
