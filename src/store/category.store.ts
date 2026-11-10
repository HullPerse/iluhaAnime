import { SCHEMA_VERSIONS } from "@/config/persistence/schemaVersions.config";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import {
  bindMirroredAtom,
  createPersistedStoreContext,
} from "@/lib/core/persistence/persisted.utils";
import { isRecord } from "@/lib/core/text/record.utils";
import { isUserImageIcon } from "@/lib/graphics/image.utils";
import type { Category, CategoryEntry } from "@/types/core/category";
import type { SignalStoreOptions } from "@/types/store/options";
import type { CategoryAtoms, CategoryData, CategorySignalStore } from "@/types/store/category";

export const CATEGORY_SCHEMA_VERSION = SCHEMA_VERSIONS.categories;

const DEFAULT_CATEGORY_ICON = "w98_directory_zipper.ico";

let nextId = 1;
function genId(): string {
  return `cat_${nextId++}_${Date.now()}`;
}
function genEntryId(): string {
  return `entry_${nextId++}_${Date.now()}`;
}

function isCategory(value: unknown): value is Category {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.icon === "string" &&
    typeof value.name === "string" &&
    typeof value.order === "number" &&
    typeof value.createdAt === "number"
  );
}

function isCategoryEntry(value: unknown): value is CategoryEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.type === "torrent" || value.type === "folder") &&
    (value.torrentId === undefined || typeof value.torrentId === "number") &&
    (value.infoHash === undefined || typeof value.infoHash === "string") &&
    (value.saveDir === undefined || typeof value.saveDir === "string") &&
    (value.totalBytes === undefined || typeof value.totalBytes === "number") &&
    (value.folderPath === undefined || typeof value.folderPath === "string")
  );
}

function readCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCategory);
}

function readCollapsedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string");
}

function readEntries(value: unknown): Record<string, CategoryEntry[]> {
  if (!isRecord(value)) return {};
  const entries: Record<string, CategoryEntry[]> = {};
  for (const [key, list] of Object.entries(value)) {
    if (Array.isArray(list)) entries[key] = list.filter(isCategoryEntry);
  }
  return entries;
}

function getNextCategoryName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let i = 1;
  while (existing.includes(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

function readLegacyCategories(
  getStorage: () => Storage | undefined
): { data: Record<string, unknown>; schemaVersion: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem("categories"));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  const state = isRecord(parsed.state) ? parsed.state : parsed;
  return { data: state, schemaVersion: CATEGORY_SCHEMA_VERSION };
}

export function createCategorySignalStore(options: SignalStoreOptions = {}): CategorySignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "categories",
    short: "category",
    schemaVersion: CATEGORY_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => readLegacyCategories(get),
  });

  const persisted = persistor.read();
  const persistedData = persisted?.data ?? {};
  const data: CategoryData = {
    categories: readCategories(persistedData.categories).map((category) =>
      isUserImageIcon(category.icon) ? { ...category, icon: DEFAULT_CATEGORY_ICON } : category
    ),
    collapsedIds: readCollapsedIds(persistedData.collapsedIds),
    entries: readEntries(persistedData.entries),
  };
  const mirror: Record<string, unknown> = { ...data };
  const atoms: CategoryAtoms = {
    categories: bindMirroredAtom(store, "categories", data.categories, mirror),
    collapsedIds: bindMirroredAtom(store, "collapsedIds", data.collapsedIds, mirror),
    entries: bindMirroredAtom(store, "entries", data.entries, mirror),
  };

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
          icon: DEFAULT_CATEGORY_ICON,
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
      const created: CategoryEntry = { ...entry, id: genEntryId() };
      atoms.entries.set({
        ...entries,
        [categoryId]: [...list, created],
      });
    },
    changeIcon: (id, icon) => {
      atoms.categories.set(atoms.categories.get().map((c) => (c.id === id ? { ...c, icon } : c)));
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
        entries[catId] = entries[catId].filter((e) => e.type !== "folder" || e.folderPath !== path);
      }
      atoms.entries.set(entries);
    },
    removeEntriesByTorrentId: (id) => {
      const entries = { ...atoms.entries.get() };
      for (const catId of Object.keys(entries)) {
        entries[catId] = entries[catId].filter((e) => e.type !== "torrent" || e.torrentId !== id);
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
      if (!moved) return;
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
      if (categories.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
        return;
      }
      atoms.categories.set(categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
    },
    reorderCategories: (ids) => {
      const categories = atoms.categories.get();
      const next = ids.flatMap((id, index) => {
        const category = categories.find((c) => c.id === id);
        return category ? [{ ...category, order: index }] : [];
      });
      atoms.categories.set(next);
    },
    setCategoryCollapsed: (id, collapsed) => {
      const collapsedIds = atoms.collapsedIds.get();
      let next = collapsedIds.filter((c) => c !== id);
      if (collapsed) next = collapsedIds.includes(id) ? collapsedIds : [...collapsedIds, id];
      atoms.collapsedIds.set(next);
    },
  };

  finishAdopt(() => ({ ...mirror }), { remove: "categories" });

  return handle;
}

const categories = createCategorySignalStore();

export const categoryAtoms = categories.atoms;
export const addCategory = categories.addCategory;
export const addCategoryEntry = categories.addEntry;
export const changeCategoryIcon = categories.changeIcon;
export const removeCategory = categories.removeCategory;
export const removeEntriesByFolderPath = categories.removeEntriesByFolderPath;
export const moveCategoryEntry = categories.moveEntry;
export const removeCategoryEntry = categories.removeEntry;
export const renameCategory = categories.renameCategory;
export const setCategoryCollapsed = categories.setCategoryCollapsed;
