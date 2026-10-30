import type { ChartTooltipData } from "./tooltip.chart";

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
}

export interface ColumnChartProps {
  data: readonly ColumnDatum[];
  ariaLabel: string;
  description?: string;
  formatValue: (value: number) => string;
  axisFormat?: (value: number) => string;
  tooltip?: (datum: ColumnDatum, index: number) => ChartTooltipData;
  activeText?: (datum: ColumnDatum, index: number) => string;
  onActivate?: (index: number) => void;
  height?: number;
  gap?: number;
  reference?: { value: number; label?: string };
  band?: { from: number; to: number };
  xDomain?: readonly [number, number];
  emptyLabel?: string;
}
