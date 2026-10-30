export interface PreviewAnchor {
  url: string;
  /** The hovered row, in viewport coordinates. */
  rect: { top: number; bottom: number; left: number; right: number };
}

export type RowKeyAction = "row-up" | "row-down";
