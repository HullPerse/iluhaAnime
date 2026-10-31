import { createSignalStore } from "@/lib/core/signal.store";
import type { ModalSignalStore } from "@/types/store/modal";
import type { ModalEntry, ModalScope, ModalStacks } from "@/types/ui/modal";

let nextModalId = 1;

function emptyStacks(): ModalStacks {
  return {
    app: [],
    anilist: [],
    search: [],
    collection: [],
    player: [],
    torrent: [],
    settings: [],
  };
}

export function createModalSignalStore(): ModalSignalStore {
  const store = createSignalStore();
  const stacks = store.atom<ModalStacks>("stacks", emptyStacks());

  const setScope = (scope: ModalScope, entries: ModalEntry[]): void => {
    stacks.set({ ...stacks.get(), [scope]: entries });
  };

  const handle: ModalSignalStore = {
    atoms: { stacks },
    push: (scope, key, params) => {
      const entry: ModalEntry = { id: nextModalId++, key, params };
      setScope(scope, [...stacks.get()[scope], entry]);
      return entry.id;
    },
    replace: (scope, key, params) => {
      const entry: ModalEntry = { id: nextModalId++, key, params };
      const current = stacks.get()[scope];
      setScope(scope, current.length === 0 ? [entry] : [...current.slice(0, -1), entry]);
      return entry.id;
    },
    pop: (scope) => {
      const current = stacks.get()[scope];
      const top = current.at(-1) ?? null;
      if (!top) return null;
      setScope(scope, current.slice(0, -1));
      return top;
    },
    clearScope: (scope) => {
      if (stacks.get()[scope].length === 0) return;
      setScope(scope, []);
    },
    clearAll: () => {
      stacks.set(emptyStacks());
    },
    batch: (fn) => {
      store.batch(fn);
    },
  };

  return handle;
}

const modals = createModalSignalStore();

export const modalAtoms = modals.atoms;
export const pushModal = modals.push;
export const popModal = modals.pop;
export const clearModalScope = modals.clearScope;
export const clearAllModals = modals.clearAll;

export function topModal(scope: ModalScope): ModalEntry | null {
  return modalAtoms.stacks.get()[scope].at(-1) ?? null;
}

export function modalDepth(scope: ModalScope): number {
  return modalAtoms.stacks.get()[scope].length;
}

export function resetModalAtoms(): void {
  modals.clearAll();
  nextModalId = 1;
}
