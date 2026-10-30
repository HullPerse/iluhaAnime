export const RATIO_PALETTE = [
  "var(--color-secondary)",
  "var(--color-graph-sequel)",
  "var(--color-success)",
  "var(--color-destructive)",
  "var(--color-link-hover)",
  "var(--color-graph-side)",
  "var(--color-graph-prequel)",
  "var(--color-muted)",
] as const;

export const CHART_LAYOUT = {
  barRowHeight: 22,
  barMinHeight: 8,
  barMaxHeight: 14,
  labelGutter: 96,
  valueGutter: 52,
  valueAxisGutter: 30,
  bottomAxisGutter: 20,
  plotPadding: 4,
  tooltipWidth: 168,
  tooltipOffset: 10,
} as const;
