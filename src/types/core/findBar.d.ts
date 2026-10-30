import type { Cell } from "@/types/core/signal";

export interface FindBarState {
  open: boolean;
  caseSensitive: boolean;
  wholeWords: boolean;
}

export interface FindBarSignalStore {
  atoms: { bar: Cell<FindBarState> };
  openBar: () => void;
  closeBar: () => void;
  setCaseSensitive: (value: boolean) => void;
  setWholeWords: (value: boolean) => void;
}
