import type { KeyboardEvent } from "react";

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
