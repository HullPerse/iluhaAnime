import { subscribeHotkeys } from "@/lib/registryHotkeys.utils";
import { createSignalStore } from "@/lib/signal.store";
import type { Cell } from "@/types/signal";
import type { OverlayEntry, OverlayStore } from "@/types/overlay";

type OverlayActionKeys = "register" | "dismissTop";

export type OverlayData = Omit<OverlayStore, OverlayActionKeys>;
export type OverlayAtoms = { [K in keyof OverlayData]: Cell<OverlayData[K]> };

let nextOverlayId = 1;

function topOverlay(entries: readonly OverlayEntry[]): OverlayEntry | null {
  return entries.at(-1) ?? null;
}

export interface OverlaySignalStore {
  atoms: OverlayAtoms;
  register: (dismiss: OverlayEntry["dismiss"]) => () => void;
  dismissTop: () => boolean;
}

export function createOverlaySignalStore(): OverlaySignalStore {
  const store = createSignalStore();
  const entries = store.atom<OverlayEntry[]>("entries", []);

  function handleEscapeDismiss(event: KeyboardEvent): void {
    const top = topOverlay(entries.get());
    if (!top?.dismiss) return;

    event.preventDefault();
    event.stopPropagation();
    top.dismiss();
  }

  let unsubscribeEscape: (() => void) | null = null;

  return {
    atoms: { entries } as OverlayAtoms,
    register: (dismiss) => {
      const entry: OverlayEntry = { id: nextOverlayId++, dismiss };
      entries.set([...entries.get(), entry]);
      if (typeof window !== "undefined" && entries.get().length === 1) {
        unsubscribeEscape = subscribeHotkeys(window, {
          defs: [{ id: "dismiss-top", chord: "Escape", repeat: "once" }],
          capture: true,
          onAction: (_id, event) => handleEscapeDismiss(event),
        });
      }
      return () => {
        entries.set(entries.get().filter((item) => item.id !== entry.id));
        if (typeof window !== "undefined" && entries.get().length === 0) {
          unsubscribeEscape?.();
          unsubscribeEscape = null;
        }
      };
    },
    dismissTop: () => {
      const top = topOverlay(entries.get());
      if (!top?.dismiss) return false;
      top.dismiss();
      return true;
    },
  };
}

const overlays = createOverlaySignalStore();

export const overlayAtoms = overlays.atoms;
export const registerOverlay = overlays.register;
export const dismissTopOverlay = overlays.dismissTop;
