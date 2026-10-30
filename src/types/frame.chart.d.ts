import type { KeyboardEvent, ReactNode } from "react";

export interface ChartPlot {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartFrameProps {
  height: number;
  ariaLabel: string;
  description?: string;
  announcement?: string | null;
  margin?: Partial<ChartMargin>;
  interactive?: boolean;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  children: (plot: ChartPlot, width: number) => ReactNode;
}
