import { createSignalStore } from "@/lib/core/signal.store";
import type { FindBarSignalStore, FindBarState } from "@/types/core/findBar";

export const EMPTY_FIND_BAR: FindBarState = {
  open: false,
  caseSensitive: false,
  wholeWords: false,
};

export function createFindBarSignalStore(): FindBarSignalStore {
  const store = createSignalStore();
  const bar = store.atom<FindBarState>("bar", EMPTY_FIND_BAR);
  const patch = (partial: Partial<FindBarState>): void => {
    bar.set({ ...bar.get(), ...partial });
  };
  return {
    atoms: { bar },
    openBar: () => patch({ open: true }),
    closeBar: () => patch({ open: false }),
    setCaseSensitive: (caseSensitive) => patch({ caseSensitive }),
    setWholeWords: (wholeWords) => patch({ wholeWords }),
  };
}

const findBar = createFindBarSignalStore();

export const findBarAtoms = findBar.atoms;
export const openFindBar = findBar.openBar;
export const closeFindBar = findBar.closeBar;
export const setFindBarCaseSensitive = findBar.setCaseSensitive;
export const setFindBarWholeWords = findBar.setWholeWords;
