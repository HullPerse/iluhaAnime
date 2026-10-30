import { createSignalStore } from "@/lib/signal.store";
import type { VimHintsState, VimSignalStore } from "@/types/vim";

export const EMPTY_VIM_HINTS: VimHintsState = {
  open: false,
  badges: [],
  buffer: "",
  pinned: null,
  overflow: 0,
};

export function createVimSignalStore(): VimSignalStore {
  const store = createSignalStore();
  const hints = store.atom<VimHintsState>("hints", EMPTY_VIM_HINTS);
  const count = store.atom<string>("count", "");

  const patch = (partial: Partial<VimHintsState>): void => {
    hints.set({ ...hints.get(), ...partial });
  };

  return {
    atoms: { hints, count },
    openHints: (badges, overflow) => {
      hints.set({ open: true, badges, buffer: "", pinned: null, overflow });
    },
    closeHints: () => {
      hints.set(EMPTY_VIM_HINTS);
    },
    setBuffer: (buffer) => patch({ buffer }),
    setPinned: (pinned) => patch({ pinned }),
    setCount: (next) => count.set(next),
    reset: () => {
      hints.set(EMPTY_VIM_HINTS);
      count.set("");
    },
  };
}

const vim = createVimSignalStore();

export const vimAtoms = vim.atoms;
export const openHints = vim.openHints;
export const closeHints = vim.closeHints;
export const setVimBuffer = vim.setBuffer;
export const setVimPinned = vim.setPinned;
export const setVimCount = vim.setCount;
export const resetVimHints = vim.reset;
