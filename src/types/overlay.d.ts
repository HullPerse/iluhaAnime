export type OverlayDismiss = (() => void) | null;

export interface OverlayEntry {
  id: number;
  /** `null` when the overlay's own renderer handles Escape, as base-ui dialogs do. */
  dismiss: OverlayDismiss;
}

export interface OverlayStore {
  entries: OverlayEntry[];
  /** Adds the overlay on top of the stack and returns its unregister function. */
  register: (dismiss: OverlayDismiss) => () => void;
  /** Dismisses the top overlay when the stack owns its Escape. */
  dismissTop: () => boolean;
}
