import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchClick, dispatchFocus } from "@/lib/hotkeys/dispatch.hotkeys";

const nodes: HTMLElement[] = [];

function target(): HTMLElement {
  const node = document.createElement("div");
  document.body.append(node);
  nodes.push(node);
  return node;
}

afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
});

describe("dispatchClick", () => {
  it("dispatches a bubbling plain click", () => {
    const node = target();
    const listener = vi.fn();
    node.addEventListener("click", listener);
    const event = dispatchClick(node, "plain");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(event.type).toBe("click");
    expect(event.ctrlKey).toBe(false);
    expect(event.metaKey).toBe(false);
    expect(event.bubbles).toBe(true);
  });

  it("adds the ctrl and meta modifiers on the ctrl variant", () => {
    const node = target();
    const listener = vi.fn();
    node.addEventListener("click", listener);
    dispatchClick(node, "ctrl");
    const event = listener.mock.calls[0]?.[0] as MouseEvent;
    expect(event.ctrlKey).toBe(true);
    expect(event.metaKey).toBe(true);
  });

  it("dispatches a contextmenu event for the right-click variant", () => {
    const node = target();
    const listener = vi.fn();
    node.addEventListener("contextmenu", listener);
    const event = dispatchClick(node, "contextmenu");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(event.type).toBe("contextmenu");
    expect(event.button).toBe(2);
  });

  it("reaches an ancestor listener through bubbling", () => {
    const parent = target();
    const child = document.createElement("span");
    parent.append(child);
    const listener = vi.fn();
    parent.addEventListener("click", listener);
    dispatchClick(child, "plain");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchFocus", () => {
  it("moves keyboard focus into the element", () => {
    const node = document.createElement("input");
    document.body.append(node);
    nodes.push(node);
    dispatchFocus(node);
    expect(document.activeElement).toBe(node);
  });

  it("ignores a non-element target", () => {
    expect(() => dispatchFocus(document as unknown as Element)).not.toThrow();
  });
});
