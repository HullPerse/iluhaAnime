import type { ChartTooltipData } from "./tooltip.chart";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
}

export interface BarChartProps {
  data: readonly BarDatum[];
  ariaLabel: string;
  description?: string;
  formatValue: (value: number) => string;
  tooltip?: (datum: BarDatum, index: number) => ChartTooltipData;
  activeText?: (datum: BarDatum, index: number) => string;
  onActivate?: (index: number) => void;
  height?: number;
  emptyLabel?: string;
  labelChars?: number;
}
