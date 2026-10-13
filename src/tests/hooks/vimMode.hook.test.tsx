import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVimMode } from "@/hooks/vimMode.hook";
import { patchSettings } from "@/store/settings.store";
import { resetVimHints, vimAtoms } from "@/store/vim.store";

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (): string => "/search",
}));

const nodes: HTMLElement[] = [];

function hintableButton(label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = label;
  element.getBoundingClientRect = () =>
    ({
      top: 10,
      left: 10,
      bottom: 30,
      right: 60,
      width: 50,
      height: 20,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.append(element);
  nodes.push(element);
  return element;
}

function pressF(): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { code: "KeyF", bubbles: true, cancelable: true })
  );
}

function click(button: number, type = "pointerdown"): void {
  nodes[0]?.dispatchEvent(new MouseEvent(type, { bubbles: true, button }));
}

function hintsOpen(): boolean {
  return vimAtoms.hints.get().open;
}

beforeEach(() => {
  patchSettings({ vimMode: true });
  hintableButton("one");
  hintableButton("two");
});

afterEach(() => {
  cleanup();
  resetVimHints();
  for (const node of nodes.splice(0)) node.remove();
});

describe("useVimMode click-away", () => {
  it("closes open hints on left click", () => {
    const render = renderHook(() => useVimMode());
    pressF();
    expect(hintsOpen()).toBe(true);
    click(0);
    expect(hintsOpen()).toBe(false);
    render.unmount();
  });

  it("closes open hints on middle click", () => {
    const render = renderHook(() => useVimMode());
    pressF();
    expect(hintsOpen()).toBe(true);
    click(1);
    expect(hintsOpen()).toBe(false);
    render.unmount();
  });

  it("closes open hints on right click menu", () => {
    const render = renderHook(() => useVimMode());
    pressF();
    expect(hintsOpen()).toBe(true);
    click(2, "contextmenu");
    expect(hintsOpen()).toBe(false);
    render.unmount();
  });

  it("ignores clicks while no hints are open and cleans up on unmount", () => {
    const render = renderHook(() => useVimMode());
    expect(hintsOpen()).toBe(false);
    click(0);
    expect(hintsOpen()).toBe(false);
    render.unmount();
    pressF();
    click(0);
    expect(hintsOpen()).toBe(false);
  });
});
