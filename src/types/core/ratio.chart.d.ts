import type { ChartTooltipData } from "@/types/core/tooltip.chart";

export interface RatioDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export interface RatioChartProps {
  data: readonly RatioDatum[];
  ariaLabel: string;
  description?: string;
  formatValue: (value: number) => string;
  tooltip?: (datum: RatioDatum, index: number) => ChartTooltipData;
  activeText?: (datum: RatioDatum, index: number) => string;
  onActivate?: (index: number) => void;
  emptyLabel?: string;
}
