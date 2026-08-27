import type { KeyboardEvent } from "react";

export function moveIndex(
  current: number,
  delta: number,
  length: number
): number {
  if (length <= 0) return -1;
  return (current + delta + length) % length;
}

export interface ListNavigationOptions<T extends Element = Element> {
  count: number;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  axis?: "vertical" | "horizontal";
  enabled?: boolean;
  onEnter?: (index: number) => void;
  onTab?: (index: number) => void;
  onEscape?: () => boolean;
  onFocus?: (index: number, event: KeyboardEvent<T>) => void;
  onUnhandled?: (event: KeyboardEvent<T>) => void;
}

export function createListNavigationHandler<T extends Element = Element>({
  count,
  activeIndex,
  setActiveIndex,
  axis = "vertical",
  enabled = true,
  onEnter,
  onTab,
  onEscape,
  onFocus,
  onUnhandled,
}: ListNavigationOptions<T>): (event: KeyboardEvent<T>) => void {
  const nextKey = axis === "vertical" ? "ArrowDown" : "ArrowRight";
  const previousKey = axis === "vertical" ? "ArrowUp" : "ArrowLeft";

  const move = (event: KeyboardEvent<T>, delta: number) => {
    event.preventDefault();
    const next = moveIndex(activeIndex, delta, count);
    setActiveIndex(next);
    onFocus?.(next, event);
  };

  return (event) => {
    const { key } = event;
    if (key === "Escape" && onEscape && onEscape()) {
      event.preventDefault();
      return;
    }
    if (enabled) {
      if (key === nextKey) {
        move(event, 1);
        return;
      }
      if (key === previousKey) {
        move(event, -1);
        return;
      }
      if (key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        onFocus?.(0, event);
        return;
      }
      if (key === "End") {
        event.preventDefault();
        setActiveIndex(count - 1);
        onFocus?.(count - 1, event);
        return;
      }
      if (key === "Enter" && count > 0 && activeIndex >= 0) {
        event.preventDefault();
        onEnter?.(activeIndex);
        return;
      }
      if (key === "Tab" && !event.shiftKey && count > 0 && activeIndex >= 0) {
        event.preventDefault();
        onTab?.(activeIndex);
        return;
      }
    }
    onUnhandled?.(event);
  };
}

export function enterOrSpace(
  onActivate: () => void
): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  };
}

export function enterSubmit(
  onSubmit: () => void
): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === "Enter") onSubmit();
  };
}

export function modEnter(onRun: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") onRun();
  };
}
