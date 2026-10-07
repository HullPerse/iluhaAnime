import { createSignalStore, type Cell } from "@/lib/state/signal.store";
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

  function handleEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    const top = topOverlay(entries.get());
    if (!top?.dismiss) return;

    event.preventDefault();
    event.stopPropagation();
    top.dismiss();
  }

  return {
    atoms: { entries } as OverlayAtoms,
    register: (dismiss) => {
      const entry: OverlayEntry = { id: nextOverlayId++, dismiss };
      entries.set([...entries.get(), entry]);
      if (typeof window !== "undefined" && entries.get().length === 1) {
        window.addEventListener("keydown", handleEscape, true);
      }
      return () => {
        entries.set(entries.get().filter((item) => item.id !== entry.id));
        if (typeof window !== "undefined" && entries.get().length === 0) {
          window.removeEventListener("keydown", handleEscape, true);
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
