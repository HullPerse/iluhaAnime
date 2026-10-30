import type { KeyboardEvent } from "react";

export interface ChartCursor {
  active: number | null;
  setActive: (index: number | null) => void;
  handlePointerLeave: () => void;
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  handleFocus: () => void;
  handleBlur: () => void;
}
