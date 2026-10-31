export interface PreviewAnchor {
  url: string;
  rect: { top: number; bottom: number; left: number; right: number };
}

export type RowKeyAction = "row-up" | "row-down";
