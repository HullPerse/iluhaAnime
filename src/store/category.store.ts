import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Category, CategoryEntry } from "@/types";
import type { CategoryStore } from "@/types/category";

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
      addCategory: (name) => {
        const id = genId();
        set((s) => {
          const names = s.categories.map((c) => c.name);
          const finalName = getNextCategoryName(names, name);
          return {
            categories: [
              ...s.categories,
              {
                id: id,
                icon: "w98_directory_zipper.ico",
                name: finalName,
                order: s.categories.length,
                createdAt: Date.now(),
              },
            ],
          };
        });
        return id;
      },
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
      categories: [],
      changeIcon: (id, icon) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, icon } : c
          ),
        })),
      entries: {},
      removeCategory: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.entries;
          return {
            categories: s.categories.filter((c) => c.id !== id),
            entries: rest,
          };
        }),
      removeEntriesByFolderPath: (path) =>
        set((s) => {
          const entries = { ...s.entries };
          for (const catId of Object.keys(entries)) {
            entries[catId] = entries[catId].filter(
              (e) => e.type !== "folder" || e.folderPath !== path
            );
          }
          return { entries };
        }),
      removeEntriesByTorrentId: (id) =>
        set((s) => {
          const entries = { ...s.entries };
          for (const catId of Object.keys(entries)) {
            entries[catId] = entries[catId].filter(
              (e) => e.type !== "torrent" || e.torrentId !== id
            );
          }
          return { entries };
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
      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, name } : c
          ),
        })),
      reorderCategories: (ids) =>
        set((s) => ({
          categories: ids
            .map((id, i) => {
              const cat = s.categories.find((c) => c.id === id);
              return cat ? { ...cat, order: i } : cat;
            })
            .filter(Boolean) as Category[],
        })),
    }),
    {
      name: "categories",
      version: 1,
    }
  )
);
