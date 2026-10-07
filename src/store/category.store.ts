import { createPersistor, persistKey, type Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import type { Category, CategoryEntry, CategoryStore } from "@/types/category";

export const CATEGORY_SCHEMA_VERSION = 1;

let nextId = 1;
function genId(): string {
  return `cat_${nextId++}_${Date.now()}`;
}
function genEntryId(): string {
  return `entry_${nextId++}_${Date.now()}`;
}

function getNextCategoryName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseImportCategory(item: unknown, order: number): Category | null {
  if (!isRecord(item)) return null;
  const { id, name, icon, order: rawOrder, createdAt } = item as Partial<Category>;
  if (typeof id !== "string" || typeof name !== "string" || typeof icon !== "string") return null;
  return {
    id,
    icon,
    name,
    order: typeof rawOrder === "number" ? rawOrder : order,
    createdAt: typeof createdAt === "number" ? createdAt : Date.now(),
  };
}

function parseImportEntry(item: unknown): CategoryEntry | null {
  if (!isRecord(item)) return null;
  const candidate = item as Partial<CategoryEntry>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    (candidate.type !== "torrent" && candidate.type !== "folder")
  ) {
    return null;
  }
  return {
    id: candidate.id,
    type: candidate.type,
    name: candidate.name,
    torrentId: typeof candidate.torrentId === "number" ? candidate.torrentId : undefined,
    infoHash: typeof candidate.infoHash === "string" ? candidate.infoHash : undefined,
    saveDir: typeof candidate.saveDir === "string" ? candidate.saveDir : undefined,
    totalBytes: typeof candidate.totalBytes === "number" ? candidate.totalBytes : undefined,
    folderPath: typeof candidate.folderPath === "string" ? candidate.folderPath : undefined,
  };
}

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
  | "setCategoryCollapsed"
  | "exportCategories"
  | "importCategories";

export type CategoryData = Omit<CategoryStore, CategoryActionKeys>;
export type CategoryAtoms = { [K in keyof CategoryData]: Cell<CategoryData[K]> };

function readLegacyCategories(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("categories"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown };
  const state = envelope.state && typeof envelope.state === "object" ? envelope.state : parsed;
  if (!state || typeof state !== "object") return null;
  return { data: state as Record<string, unknown>, schemaVersion: CATEGORY_SCHEMA_VERSION };
}

function defaultGetStorage(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export interface CategorySignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface CategorySignalStore {
  atoms: CategoryAtoms;
  persistor: Persistor;
  addCategory: (name: string) => string;
  addEntry: (
    categoryId: string,
    entry: Omit<CategoryEntry, "id">
  ) => void;
  changeIcon: (id: string, icon: string) => void;
  removeCategory: (id: string) => void;
  removeEntriesByFolderPath: (path: string) => void;
  removeEntriesByTorrentId: (id: number) => void;
  moveEntry: (categoryId: string, entryId: string, delta: number) => void;
  removeEntry: (categoryId: string, entryId: string) => void;
  renameCategory: (id: string, name: string) => void;
  reorderCategories: (ids: string[]) => void;
  setCategoryCollapsed: (id: string, collapsed: boolean) => void;
  exportCategories: () => string;
  importCategories: (raw: unknown) => number;
}

export function createCategorySignalStore(options: CategorySignalOptions = {}): CategorySignalStore {
  const getStorage = options.getStorage ?? defaultGetStorage;
  const store = createSignalStore();
  let adoptedFromLegacy = false;
  const persistor = createPersistor({
    storeName: "categories",
    schemaVersion: CATEGORY_SCHEMA_VERSION,
    getStorage,
    debounceMs: options.debounceMs,
    fallback: () => {
      const migrated = readLegacyCategories(getStorage);
      if (migrated) adoptedFromLegacy = true;
      return migrated;
    },
    onError: (scope, error) => reportBackgroundError(`category.signal.${scope}`, error as Error),
  });

  const persisted = persistor.read();
  const persistedData = (persisted?.data ?? {}) as Partial<CategoryData>;
  const data: CategoryData = {
    categories: Array.isArray(persistedData.categories)
      ? (persistedData.categories as Category[])
      : [],
    collapsedIds: Array.isArray(persistedData.collapsedIds)
      ? (persistedData.collapsedIds as string[])
      : [],
    entries:
      persistedData.entries && typeof persistedData.entries === "object"
        ? (persistedData.entries as Record<string, CategoryEntry[]>)
        : {},
  };
  const mirror: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
  const atoms = {} as CategoryAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    const cell = store.atom(key, source[key]);
    const handle: Cell<unknown> = {
      id: cell.id,
      get: cell.get,
      set: (value) => {
        cell.set(value);
        mirror[key] = value;
      },
      update: (fn) => {
        const next = (fn as (prev: unknown) => unknown)(cell.get());
        cell.set(next);
        mirror[key] = next;
      },
      subscribe: cell.subscribe,
    };
    sink[key] = handle;
  }

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const handle: CategorySignalStore = {
    atoms,
    persistor,
    addCategory: (name) => {
      const id = genId();
      const names = atoms.categories.get().map((c) => c.name);
      const finalName = getNextCategoryName(names, name);
      atoms.categories.set([
        ...atoms.categories.get(),
        {
          id,
          icon: "w98_directory_zipper.ico",
          name: finalName,
          order: atoms.categories.get().length,
          createdAt: Date.now(),
        },
      ]);
      return id;
    },
    addEntry: (categoryId, entry) => {
      const entries = atoms.entries.get();
      const list = entries[categoryId] || [];
      if (entry.type === "torrent" && entry.infoHash) {
        if (list.some((e) => e.infoHash === entry.infoHash)) return;
      }
      if (entry.type === "folder" && entry.folderPath) {
        if (list.some((e) => e.folderPath === entry.folderPath)) return;
      }
      atoms.entries.set({
        ...entries,
        [categoryId]: [...list, { ...entry, id: genEntryId() } as CategoryEntry],
      });
    },
    changeIcon: (id, icon) => {
      atoms.categories.set(
        atoms.categories.get().map((c) => (c.id === id ? { ...c, icon } : c))
      );
    },
    removeCategory: (id) => {
      const entries = atoms.entries.get();
      const { [id]: _removed, ...rest } = entries;
      atoms.categories.set(atoms.categories.get().filter((c) => c.id !== id));
      atoms.entries.set(rest);
    },
    removeEntriesByFolderPath: (path) => {
      const entries = { ...atoms.entries.get() };
      for (const catId of Object.keys(entries)) {
        entries[catId] = entries[catId].filter(
          (e) => e.type !== "folder" || e.folderPath !== path
        );
      }
      atoms.entries.set(entries);
    },
    removeEntriesByTorrentId: (id) => {
      const entries = { ...atoms.entries.get() };
      for (const catId of Object.keys(entries)) {
        entries[catId] = entries[catId].filter(
          (e) => e.type !== "torrent" || e.torrentId !== id
        );
      }
      atoms.entries.set(entries);
    },
    moveEntry: (categoryId, entryId, delta) => {
      const entries = atoms.entries.get();
      const list = entries[categoryId];
      if (!list) return;
      const index = list.findIndex((entry) => entry.id === entryId);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= list.length) return;
      const next = [...list];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      atoms.entries.set({ ...entries, [categoryId]: next });
    },
    removeEntry: (categoryId, entryId) => {
      const entries = atoms.entries.get();
      const list = entries[categoryId];
      if (!list) return;
      atoms.entries.set({
        ...entries,
        [categoryId]: list.filter((e) => e.id !== entryId),
      });
    },
    renameCategory: (id, name) => {
      const trimmed = name.trim().slice(0, 80);
      if (!trimmed) return;
      const categories = atoms.categories.get();
      if (
        categories.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())
      ) {
        return;
      }
      atoms.categories.set(categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
    },
    reorderCategories: (ids) => {
      const categories = atoms.categories.get();
      atoms.categories.set(
        ids
          .map((id, i) => {
            const cat = categories.find((c) => c.id === id);
            return cat ? { ...cat, order: i } : cat;
          })
          .filter(Boolean) as Category[]
      );
    },
    setCategoryCollapsed: (id, collapsed) => {
      const collapsedIds = atoms.collapsedIds.get();
      atoms.collapsedIds.set(
        collapsed
          ? collapsedIds.includes(id)
            ? collapsedIds
            : [...collapsedIds, id]
          : collapsedIds.filter((c) => c !== id)
      );
    },
    exportCategories: () => {
      const categories = atoms.categories.get();
      const entries = atoms.entries.get();
      return JSON.stringify({ categories, entries });
    },
    importCategories: (raw: unknown) => {
      if (!isRecord(raw) || !Array.isArray(raw.categories) || !isRecord(raw.entries)) {
        throw new Error("invalid backup");
      }
      const categories: Category[] = [];
      for (const item of raw.categories) {
        const category = parseImportCategory(item, categories.length);
        if (category) categories.push(category);
      }
      const ids = new Set(categories.map((category) => category.id));
      const entries: Record<string, CategoryEntry[]> = {};
      for (const [categoryId, list] of Object.entries(raw.entries)) {
        if (!ids.has(categoryId) || !Array.isArray(list)) continue;
        const kept: CategoryEntry[] = [];
        for (const item of list) {
          const entry = parseImportEntry(item);
          if (entry) kept.push(entry);
        }
        entries[categoryId] = kept;
      }
      atoms.categories.set(categories);
      atoms.entries.set(entries);
      return categories.length;
    },
  };

  if (adoptedFromLegacy) {
    persistor.write({ ...mirror });
    persistor.flush();
    const [storage, storageError] = attemptSync(() => getStorage());
    if (storageError !== null) reportBackgroundError("category.signal.adopt", storageError);
    else {
      const [adopted, adoptError] = attemptSync(() => storage?.getItem(persistKey("categories")));
      if (adoptError !== null) reportBackgroundError("category.signal.adopt", adoptError);
      else if (adopted) {
        const [, removeError] = attemptSync(() => storage?.removeItem("categories"));
        if (removeError !== null) reportBackgroundError("category.signal.adopt", removeError);
      }
    }
  }

  return handle;
}

const categories = createCategorySignalStore();

export const categoryAtoms = categories.atoms;
export const categoryPersistor = categories.persistor;
export const addCategory = categories.addCategory;
export const addCategoryEntry = categories.addEntry;
export const changeCategoryIcon = categories.changeIcon;
export const removeCategory = categories.removeCategory;
export const removeEntriesByFolderPath = categories.removeEntriesByFolderPath;
export const removeEntriesByTorrentId = categories.removeEntriesByTorrentId;
export const moveCategoryEntry = categories.moveEntry;
export const removeCategoryEntry = categories.removeEntry;
export const renameCategory = categories.renameCategory;
export const reorderCategories = categories.reorderCategories;
export const setCategoryCollapsed = categories.setCategoryCollapsed;
export const exportCategories = categories.exportCategories;
export const importCategories = categories.importCategories;

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", () => categories.persistor.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") categories.persistor.flush();
  });
}
