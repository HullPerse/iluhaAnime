import { create } from "zustand";

import type { OverlayEntry, OverlayStore } from "@/types/overlay";

let nextOverlayId = 1;

function topOverlay(entries: readonly OverlayEntry[]): OverlayEntry | null {
  return entries.at(-1) ?? null;
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = topOverlay(useOverlayStore.getState().entries);
  if (!top?.dismiss) return;

  event.preventDefault();
  event.stopPropagation();
  top.dismiss();
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  entries: [],
  register: (dismiss) => {
    const entry: OverlayEntry = { id: nextOverlayId++, dismiss };
    set((state) => ({ entries: [...state.entries, entry] }));
    if (typeof window !== "undefined" && get().entries.length === 1) {
      window.addEventListener("keydown", handleEscape, true);
    }
    return () => {
      set((state) => ({ entries: state.entries.filter((item) => item.id !== entry.id) }));
      if (typeof window !== "undefined" && get().entries.length === 0) {
        window.removeEventListener("keydown", handleEscape, true);
      }
    };
  },
  dismissTop: () => {
    const top = topOverlay(get().entries);
    if (!top?.dismiss) return false;
    top.dismiss();
    return true;
  },
}));
