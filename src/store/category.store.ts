import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Category, CategoryEntry, CategoryStore } from "@/types/category";

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

export const useCategoryStore = create<CategoryStore>()(
  persist(
    (set, get) => ({
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
              [categoryId]: [...list, { ...entry, id: genEntryId() } as CategoryEntry],
            },
          };
        }),
      categories: [],
      collapsedIds: [],
      changeIcon: (id, icon) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, icon } : c)),
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
      moveEntry: (categoryId, entryId, delta) =>
        set((s) => {
          const list = s.entries[categoryId];
          if (!list) return s;
          const index = list.findIndex((entry) => entry.id === entryId);
          const target = index + delta;
          if (index === -1 || target < 0 || target >= list.length) return s;
          const next = [...list];
          const [moved] = next.splice(index, 1);
          next.splice(target, 0, moved);
          return { entries: { ...s.entries, [categoryId]: next } };
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
        set((s) => {
          const trimmed = name.trim().slice(0, 80);
          if (!trimmed) return s;
          if (
            s.categories.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())
          ) {
            return s;
          }
          return {
            categories: s.categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
          };
        }),
      reorderCategories: (ids) =>
        set((s) => ({
          categories: ids
            .map((id, i) => {
              const cat = s.categories.find((c) => c.id === id);
              return cat ? { ...cat, order: i } : cat;
            })
            .filter(Boolean) as Category[],
        })),
      setCategoryCollapsed: (id, collapsed) =>
        set((s) => ({
          collapsedIds: collapsed
            ? s.collapsedIds.includes(id)
              ? s.collapsedIds
              : [...s.collapsedIds, id]
            : s.collapsedIds.filter((c) => c !== id),
        })),
      exportCategories: () => {
        const { categories, entries } = get();
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
        set({ categories, entries });
        return categories.length;
      },
    }),
    {
      name: "categories",
      version: 1,
    }
  )
);
