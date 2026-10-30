import type { ChartTooltipData } from "@/types/core/tooltip.chart";

export const tooltipAnnouncement = (data: ChartTooltipData): string => {
  const values = data.rows.map((row) => `${row.label} ${row.value}`).join(", ");
  return values ? `${data.title}: ${values}` : data.title;
};

export const LINE_HEIGHT = 14;
export const VERTICAL_PADDING = 10;

export const tooltipHeight = (data: ChartTooltipData): number => {
  return VERTICAL_PADDING + LINE_HEIGHT * (data.rows.length + 1);
};
