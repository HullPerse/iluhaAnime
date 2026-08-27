import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createListNavigationHandler,
  enterOrSpace,
  enterSubmit,
  modEnter,
  moveIndex,
} from "@/lib/keyboard.utils";

function keyEvent(
  overrides: Partial<KeyboardEvent<Element>> = {}
): KeyboardEvent<Element> {
  return {
    key: "",
    preventDefault: vi.fn(),
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...overrides,
  } as unknown as KeyboardEvent<Element>;
}

describe("moveIndex", () => {
  it("moves forward and backward with wrap-around", () => {
    expect(moveIndex(0, 1, 3)).toBe(1);
    expect(moveIndex(2, 1, 3)).toBe(0);
    expect(moveIndex(0, -1, 3)).toBe(2);
  });

  it("returns -1 for empty lists", () => {
    expect(moveIndex(0, 1, 0)).toBe(-1);
  });
});

describe("createListNavigationHandler", () => {
  it("moves the active index with arrow keys", () => {
    const setActiveIndex = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex,
    });

    const down = keyEvent({ key: "ArrowDown" });
    handler(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(setActiveIndex).toHaveBeenCalledWith(1);

    const up = keyEvent({ key: "ArrowUp" });
    handler(up);
    expect(setActiveIndex).toHaveBeenCalledWith(2);
  });

  it("respects a horizontal axis", () => {
    const setActiveIndex = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex,
      axis: "horizontal",
    });

    handler(keyEvent({ key: "ArrowLeft" }));
    expect(setActiveIndex).toHaveBeenCalledWith(2);
    expect(setActiveIndex).not.toHaveBeenCalledWith(1);
  });

  it("handles Home and End", () => {
    const setActiveIndex = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 2,
      setActiveIndex,
    });

    handler(keyEvent({ key: "Home" }));
    expect(setActiveIndex).toHaveBeenLastCalledWith(0);
    handler(keyEvent({ key: "End" }));
    expect(setActiveIndex).toHaveBeenLastCalledWith(2);
  });

  it("fires onEnter with the active index", () => {
    const onEnter = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 1,
      setActiveIndex: vi.fn(),
      onEnter,
    });

    const enter = keyEvent({ key: "Enter" });
    handler(enter);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(onEnter).toHaveBeenCalledWith(1);
  });

  it("does not fire onEnter when nothing is active", () => {
    const onEnter = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: -1,
      setActiveIndex: vi.fn(),
      onEnter,
    });

    handler(keyEvent({ key: "Enter" }));
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("fires onTab and prevents default on forward Tab with an active item", () => {
    const onTab = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex: vi.fn(),
      onTab,
    });

    const tab = keyEvent({ key: "Tab" });
    handler(tab);
    expect(tab.preventDefault).toHaveBeenCalled();
    expect(onTab).toHaveBeenCalledWith(0);
  });

  it("ignores shift+Tab", () => {
    const onTab = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex: vi.fn(),
      onTab,
    });

    const shiftTab = keyEvent({ key: "Tab", shiftKey: true });
    handler(shiftTab);
    expect(onTab).not.toHaveBeenCalled();
  });

  it("forwards Escape only when onEscape returns true", () => {
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex: vi.fn(),
      onEscape: () => false,
    });

    const escape = keyEvent({ key: "Escape" });
    handler(escape);
    expect(escape.preventDefault).not.toHaveBeenCalled();

    const handlerHandled = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex: vi.fn(),
      onEscape: () => true,
    });

    const handledEscape = keyEvent({ key: "Escape" });
    handlerHandled(handledEscape);
    expect(handledEscape.preventDefault).toHaveBeenCalled();
  });

  it("forwards unhandled keys to onUnhandled", () => {
    const onUnhandled = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex: vi.fn(),
      onUnhandled,
    });

    handler(keyEvent({ key: "x" }));
    expect(onUnhandled).toHaveBeenCalled();
  });

  it("ignores navigation when disabled", () => {
    const setActiveIndex = vi.fn();
    const onUnhandled = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex,
      enabled: false,
      onUnhandled,
    });

    handler(keyEvent({ key: "ArrowDown" }));
    expect(setActiveIndex).not.toHaveBeenCalled();
    expect(onUnhandled).toHaveBeenCalled();
  });

  it("still handles Escape when disabled", () => {
    const setActiveIndex = vi.fn();
    const onUnhandled = vi.fn();
    const handler = createListNavigationHandler({
      count: 3,
      activeIndex: 0,
      setActiveIndex,
      enabled: false,
      onEscape: () => true,
      onUnhandled,
    });

    const escape = keyEvent({ key: "Escape" });
    handler(escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(onUnhandled).not.toHaveBeenCalled();
  });
});

describe("enterOrSpace", () => {
  it("activates on Enter and Space, preventing default", () => {
    const onActivate = vi.fn();

    const enter = keyEvent({ key: "Enter" });
    enterOrSpace(onActivate)(enter);
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(onActivate).toHaveBeenCalledTimes(1);

    const space = keyEvent({ key: " " });
    enterOrSpace(onActivate)(space);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("ignores other keys", () => {
    const onActivate = vi.fn();
    enterOrSpace(onActivate)(keyEvent({ key: "a" }));
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe("enterSubmit", () => {
  it("submits on Enter", () => {
    const onSubmit = vi.fn();
    enterSubmit(onSubmit)(keyEvent({ key: "Enter" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    const onSubmit = vi.fn();
    enterSubmit(onSubmit)(keyEvent({ key: "Escape" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("modEnter", () => {
  it("runs on Ctrl+Enter", () => {
    const onRun = vi.fn();
    modEnter(onRun)(keyEvent({ key: "Enter", ctrlKey: true }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("runs on Meta+Enter", () => {
    const onRun = vi.fn();
    modEnter(onRun)(keyEvent({ key: "Enter", metaKey: true }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("ignores plain Enter", () => {
    const onRun = vi.fn();
    modEnter(onRun)(keyEvent({ key: "Enter" }));
    expect(onRun).not.toHaveBeenCalled();
  });
});
