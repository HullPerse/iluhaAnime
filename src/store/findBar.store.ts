import { createSignalStore, type Cell } from "@/lib/signal.store";

export interface FindBarState {
  open: boolean;
  caseSensitive: boolean;
  wholeWords: boolean;
}

export const EMPTY_FIND_BAR: FindBarState = {
  open: false,
  caseSensitive: false,
  wholeWords: false,
};

export interface FindBarSignalStore {
  atoms: { bar: Cell<FindBarState> };
  openBar: () => void;
  closeBar: () => void;
  setCaseSensitive: (value: boolean) => void;
  setWholeWords: (value: boolean) => void;
}

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
