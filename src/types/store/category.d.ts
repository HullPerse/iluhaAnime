import type { CategoryEntry, CategoryStore } from "@/types/core/category";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";

type CategoryActionKeys =
  | "addCategory"
  | "addEntry"
  | "changeIcon"
  | "removeCategory"
  | "removeEntriesByFolderPath"
  | "removeEntriesByTorrentId"
  | "moveEntry"
  | "removeEntry"
  | "renameCategory"
  | "reorderCategories"
  | "setCategoryCollapsed";

export type CategoryData = Omit<CategoryStore, CategoryActionKeys>;
export type CategoryAtoms = { [K in keyof CategoryData]: Cell<CategoryData[K]> };

export interface CategorySignalStore {
  atoms: CategoryAtoms;
  persistor: Persistor;
  addCategory: (name: string) => string;
  addEntry: (categoryId: string, entry: Omit<CategoryEntry, "id">) => void;
  changeIcon: (id: string, icon: string) => void;
  removeCategory: (id: string) => void;
  removeEntriesByFolderPath: (path: string) => void;
  removeEntriesByTorrentId: (id: number) => void;
  moveEntry: (categoryId: string, entryId: string, delta: number) => void;
  removeEntry: (categoryId: string, entryId: string) => void;
  renameCategory: (id: string, name: string) => void;
  reorderCategories: (ids: string[]) => void;
  setCategoryCollapsed: (id: string, collapsed: boolean) => void;
}
