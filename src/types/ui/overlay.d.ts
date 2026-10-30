export type OverlayDismiss = (() => void) | null;

export interface OverlayEntry {
  id: number;
  dismiss: OverlayDismiss;
}

export interface OverlayStore {
  entries: OverlayEntry[];
  register: (dismiss: OverlayDismiss) => () => void;
  dismissTop: () => boolean;
}
