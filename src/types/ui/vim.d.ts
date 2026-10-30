import type { HintBadge } from "@/types/core/hintsHotkeys";
import type { Cell } from "@/types/core/signal";

export interface VimHintsState {
  open: boolean;
  badges: HintBadge[];
  buffer: string;
  pinned: string | null;
  overflow: number;
}

export interface VimSignalStore {
  atoms: { hints: Cell<VimHintsState>; count: Cell<string> };
  openHints: (badges: HintBadge[], overflow: number) => void;
  closeHints: () => void;
  setBuffer: (buffer: string) => void;
  setPinned: (pinned: string | null) => void;
  setCount: (count: string) => void;
  reset: () => void;
}
