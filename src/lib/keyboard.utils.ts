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

function handleListNavigationKey<T extends Element>(
  event: KeyboardEvent<T>,
  options: {
    key: string;
    nextKey: string;
    previousKey: string;
    enabled: boolean;
    count: number;
    activeIndex: number;
    move: (delta: number) => void;
    setActiveIndex: (index: number) => void;
    onFocus?: (index: number, event: KeyboardEvent<T>) => void;
    onEnter?: (index: number) => void;
    onTab?: (index: number) => void;
    onEscape?: () => boolean;
  }
): boolean {
  const { key, nextKey, previousKey, enabled, count, activeIndex, move, setActiveIndex, onFocus, onEnter, onTab, onEscape } = options;
  if (key === "Escape" && onEscape?.()) {
    event.preventDefault();
    return true;
  }
  if (!enabled) return false;
  if (key === nextKey) {
    event.preventDefault();
    move(1);
    return true;
  }
  if (key === previousKey) {
    event.preventDefault();
    move(-1);
    return true;
  }
  const boundary = key === "Home" ? 0 : key === "End" ? count - 1 : null;
  if (boundary !== null) {
    event.preventDefault();
    setActiveIndex(boundary);
    onFocus?.(boundary, event);
    return true;
  }
  if (key === "Enter" && count > 0 && activeIndex >= 0) {
    event.preventDefault();
    onEnter?.(activeIndex);
    return true;
  }
  if (key === "Tab" && !event.shiftKey && count > 0 && activeIndex >= 0) {
    event.preventDefault();
    onTab?.(activeIndex);
    return true;
  }
  return false;
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
    const handled = handleListNavigationKey(event, {
      key: event.key,
      nextKey,
      previousKey,
      enabled,
      count,
      activeIndex,
      move: (delta) => move(event, delta),
      setActiveIndex,
      onFocus,
      onEnter,
      onTab,
      onEscape,
    });
    if (!handled) onUnhandled?.(event);
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
