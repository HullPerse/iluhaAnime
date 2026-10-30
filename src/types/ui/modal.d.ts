export type ModalScope =
  | "app"
  | "anilist"
  | "search"
  | "collection"
  | "player"
  | "torrent"
  | "settings";

export interface ModalEntry {
  id: number;
  key: string;
  params?: Record<string, string | number | boolean | null>;
}

export type ModalStacks = Record<ModalScope, ModalEntry[]>;

export interface ModalStore {
  stacks: ModalStacks;
  push: (scope: ModalScope, key: string, params?: ModalEntry["params"]) => number;
  replace: (scope: ModalScope, key: string, params?: ModalEntry["params"]) => number;
  pop: (scope: ModalScope) => ModalEntry | null;
  clearScope: (scope: ModalScope) => void;
  clearAll: () => void;
  batch: (fn: () => void) => void;
}
