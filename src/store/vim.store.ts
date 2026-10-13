import type { HintBadge } from "@/lib/hotkeys/hints.hotkeys";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";

export interface VimHintsState {
  open: boolean;
  badges: HintBadge[];
  buffer: string;
  pinned: string | null;
  overflow: number;
}

export const EMPTY_VIM_HINTS: VimHintsState = {
  open: false,
  badges: [],
  buffer: "",
  pinned: null,
  overflow: 0,
};

export interface VimSignalStore {
  atoms: { hints: Cell<VimHintsState> };
  openHints: (badges: HintBadge[], overflow: number) => void;
  closeHints: () => void;
  setBuffer: (buffer: string) => void;
  setPinned: (pinned: string | null) => void;
  reset: () => void;
}

export function createVimSignalStore(): VimSignalStore {
  const store = createSignalStore();
  const hints = store.atom<VimHintsState>("hints", EMPTY_VIM_HINTS);

  const patch = (partial: Partial<VimHintsState>): void => {
    hints.set({ ...hints.get(), ...partial });
  };

  return {
    atoms: { hints },
    openHints: (badges, overflow) => {
      hints.set({ open: true, badges, buffer: "", pinned: null, overflow });
    },
    closeHints: () => {
      hints.set(EMPTY_VIM_HINTS);
    },
    setBuffer: (buffer) => patch({ buffer }),
    setPinned: (pinned) => patch({ pinned }),
    reset: () => hints.set(EMPTY_VIM_HINTS),
  };
}

const vim = createVimSignalStore();

export const vimAtoms = vim.atoms;
export const openHints = vim.openHints;
export const closeHints = vim.closeHints;
export const setVimBuffer = vim.setBuffer;
export const setVimPinned = vim.setPinned;
export const resetVimHints = vim.reset;
