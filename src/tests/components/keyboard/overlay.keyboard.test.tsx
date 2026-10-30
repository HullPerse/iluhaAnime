import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import KeyboardHintOverlay from "@/components/shared/keyboard/overlay.keyboard.component";
import type { HintBadge } from "@/types/core/hintsHotkeys";
import { patchSettings } from "@/store/settings.store";
import { openHints, resetVimHints, setVimPinned } from "@/store/vim.store";

const nodes: HTMLElement[] = [];

const node = (text = "", rect: Partial<DOMRect> = {}): HTMLElement => {
  const element = document.createElement("button");
  element.textContent = text;
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
      ...rect,
    }) as DOMRect;
  document.body.append(element);
  nodes.push(element);
  return element;
};

const plain = (element: HTMLElement, label: string): HintBadge => {
  return { element, label, variant: "plain" };
};

beforeEach(() => {
  patchSettings({ language: "ru" });
  resetVimHints();
});

afterEach(() => {
  cleanup();
  resetVimHints();
  for (const item of nodes.splice(0)) item.remove();
});

describe("KeyboardHintOverlay", () => {
  it("renders nothing while hints are closed", () => {
    render(<KeyboardHintOverlay />);
    expect(screen.queryByText("f")).toBeNull();
  });

  it("renders one badge per hint label", () => {
    openHints([plain(node(), "f"), plain(node(), "j")], 0);
    render(<KeyboardHintOverlay />);
    expect(screen.getByText("f")).toBeTruthy();
    expect(screen.getByText("j")).toBeTruthy();
  });

  it("reports the dropped targets in the status line", () => {
    openHints([plain(node(), "f")], 3);
    render(<KeyboardHintOverlay />);
    expect(screen.getByText("ещё 3")).toBeTruthy();
  });

  it("expands the pinned label into its description and marks the target", () => {
    const element = node("Play");
    openHints([plain(element, "f")], 0);
    setVimPinned("f");
    render(<KeyboardHintOverlay />);
    expect(screen.getByText("Play", { selector: "span" })).toBeTruthy();
    expect(element.classList.contains("target-marked")).toBe(true);
    expect(screen.getByText("Play", { selector: "span" }).parentElement?.style.zIndex).toBe("2");
  });

  it("marks a focus badge with the text-cursor icon", () => {
    const element = node();
    openHints([{ element, label: "f", variant: "focus" }], 0);
    render(<KeyboardHintOverlay />);
    const badge = screen.getByText("f").parentElement;
    expect(badge?.querySelector("svg")).not.toBeNull();
  });

  it("drops badges whose element left the document", () => {
    const ghost = document.createElement("button");
    openHints([{ element: ghost, label: "f", variant: "plain" }], 0);
    render(<KeyboardHintOverlay />);
    expect(screen.queryByText("f")).toBeNull();
  });

  it("drops badges whose element hid after the scan", () => {
    const element = node("", { width: 0, height: 0, top: 0, left: 0 });
    openHints([plain(element, "f")], 0);
    render(<KeyboardHintOverlay />);
    expect(screen.queryByText("f")).toBeNull();
  });
});
