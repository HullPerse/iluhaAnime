import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Category {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

export interface CategoryEntry {
  id: string;
  type: "torrent" | "folder";
  name: string;
  torrentId?: number;
  infoHash?: string;
  saveDir?: string;
  totalBytes?: number;
  folderPath?: string;
}

interface CategoryStore {
  categories: Category[];
  entries: Record<string, CategoryEntry[]>;

  addCategory: (name: string) => string;
  removeCategory: (id: string) => void;
  renameCategory: (id: string, name: string) => void;
  reorderCategories: (ids: string[]) => void;
  addEntry: (categoryId: string, entry: Omit<CategoryEntry, "id">) => void;
  removeEntry: (categoryId: string, entryId: string) => void;
  removeEntriesByFolderPath: (path: string) => void;
  removeEntriesByTorrentId: (id: number) => void;
}

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

export const useCategoryStore = create<CategoryStore>()(
  persist(
    (set) => ({
      categories: [],
      entries: {},

      addCategory: (name) => {
        const id = genId();
        set((s) => {
          const names = s.categories.map((c) => c.name);
          const finalName = getNextCategoryName(names, name);
          return {
            categories: [
              ...s.categories,
              { id, name: finalName, order: s.categories.length, createdAt: Date.now() },
            ],
          };
        });
        return id;
      },

      removeCategory: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.entries;
          return {
            categories: s.categories.filter((c) => c.id !== id),
            entries: rest,
          };
        }),

      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, name } : c,
          ),
        })),

      reorderCategories: (ids) =>
        set((s) => ({
          categories: ids.map((id, i) => {
            const cat = s.categories.find((c) => c.id === id);
            return cat ? { ...cat, order: i } : cat;
          }).filter(Boolean) as Category[],
        })),

      addEntry: (categoryId, entry) =>
        set((s) => {
          const list = s.entries[categoryId] || [];
          if (entry.type === "torrent" && entry.infoHash) {
            if (list.some((e) => e.infoHash === entry.infoHash)) return s;
          }
          if (entry.type === "folder" && entry.folderPath) {
            if (list.some((e) => e.folderPath === entry.folderPath)) return s;
          }
          return {
            entries: {
              ...s.entries,
              [categoryId]: [
                ...list,
                { ...entry, id: genEntryId() } as CategoryEntry,
              ],
            },
          };
        }),

      removeEntry: (categoryId, entryId) =>
        set((s) => {
          const list = s.entries[categoryId];
          if (!list) return s;
          return {
            entries: {
              ...s.entries,
              [categoryId]: list.filter((e) => e.id !== entryId),
            },
          };
        }),

      removeEntriesByFolderPath: (path) =>
        set((s) => {
          const entries = { ...s.entries };
          for (const catId of Object.keys(entries)) {
            entries[catId] = entries[catId].filter(
              (e) => e.type !== "folder" || e.folderPath !== path,
            );
          }
          return { entries };
        }),

      removeEntriesByTorrentId: (id) =>
        set((s) => {
          const entries = { ...s.entries };
          for (const catId of Object.keys(entries)) {
            entries[catId] = entries[catId].filter(
              (e) => e.type !== "torrent" || e.torrentId !== id,
            );
          }
          return { entries };
        }),
    }),
    {
      name: "categories",
      version: 1,
    },
  ),
);
