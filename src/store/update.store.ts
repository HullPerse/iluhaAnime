import { createSignalStore } from "@/lib/core/signal.store";
import type { UpdateSignalStore } from "@/types/core/update";

export function createUpdateSignalStore(): UpdateSignalStore {
  const store = createSignalStore();
  const promptOpen = store.atom("promptOpen", false);
  return {
    atoms: { promptOpen },
    openPrompt: () => promptOpen.set(true),
    closePrompt: () => promptOpen.set(false),
    reset: () => promptOpen.set(false),
  };
}

const update = createUpdateSignalStore();

export const updateAtoms = update.atoms;
export const openUpdatePrompt = update.openPrompt;
export const closeUpdatePrompt = update.closePrompt;
export const resetUpdateAtoms = update.reset;
