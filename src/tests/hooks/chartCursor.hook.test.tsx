import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useChartCursor } from "@/hooks/chartCursor.hook";

const key = (k: string, modifiers: Partial<KeyboardEvent<HTMLElement>> = {}) => {
  return {
    key: k,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...modifiers,
  } as unknown as KeyboardEvent<HTMLElement>;
};

describe("useChartCursor", () => {
  it("starts empty and selects the first mark on focus", () => {
    const { result } = renderHook(() => useChartCursor(3));

    expect(result.current.active).toBeNull();
    act(() => result.current.handleFocus());
    expect(result.current.active).toBe(0);
  });

  it("walks forward and backward without leaving the range", () => {
    const { result } = renderHook(() => useChartCursor(3));
    act(() => result.current.handleFocus());

    act(() => result.current.handleKeyDown(key("ArrowRight")));
    expect(result.current.active).toBe(1);
    act(() => result.current.handleKeyDown(key("ArrowDown")));
    expect(result.current.active).toBe(2);
    act(() => result.current.handleKeyDown(key("ArrowRight")));
    expect(result.current.active).toBe(2);
    act(() => result.current.handleKeyDown(key("ArrowLeft")));
    expect(result.current.active).toBe(1);
  });

  it("supports Home, End and Escape", () => {
    const { result } = renderHook(() => useChartCursor(5));
    act(() => result.current.handleKeyDown(key("End")));
    expect(result.current.active).toBe(4);
    act(() => result.current.handleKeyDown(key("Home")));
    expect(result.current.active).toBe(0);
    act(() => result.current.handleKeyDown(key("Escape")));
    expect(result.current.active).toBeNull();
  });

  it("activates the current mark on Enter", () => {
    const onActivate = vi.fn();
    const { result } = renderHook(() => useChartCursor(3, onActivate));
    act(() => result.current.setActive(2));
    act(() => result.current.handleKeyDown(key("Enter")));
    expect(onActivate).toHaveBeenCalledWith(2);
  });

  it("prevents the default only for keys it handles", () => {
    const { result } = renderHook(() => useChartCursor(3));
    const handled = key("ArrowRight");
    act(() => result.current.handleKeyDown(handled));
    expect(handled.preventDefault).toHaveBeenCalled();
    expect(handled.stopPropagation).toHaveBeenCalled();

    const ignored = key("Tab");
    act(() => result.current.handleKeyDown(ignored));
    expect(ignored.preventDefault).not.toHaveBeenCalled();
  });

  it("ignores modified keys and empty charts", () => {
    const { result } = renderHook(() => useChartCursor(3));
    act(() => result.current.handleFocus());
    act(() => result.current.handleKeyDown(key("ArrowRight", { ctrlKey: true })));
    expect(result.current.active).toBe(0);

    const empty = renderHook(() => useChartCursor(0));
    act(() => empty.result.current.handleFocus());
    act(() => empty.result.current.handleKeyDown(key("ArrowRight")));
    expect(empty.result.current.active).toBeNull();
  });

  it("clamps a directly assigned index", () => {
    const { result } = renderHook(() => useChartCursor(3));
    act(() => result.current.setActive(9));
    expect(result.current.active).toBe(2);
    act(() => result.current.setActive(-4));
    expect(result.current.active).toBe(0);
  });
});
