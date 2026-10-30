import type { Cell } from "@/types/signal";
import type { Update } from "@tauri-apps/plugin-updater";

export interface UpdateSignalStore {
  atoms: { promptOpen: Cell<boolean> };
  openPrompt: () => void;
  closePrompt: () => void;
  reset: () => void;
}

export type UpdateCheckOutcome =
  | { status: "available"; update: Update }
  | { status: "none" }
  | { status: "error"; error: Error }
  | { status: "offline" };
