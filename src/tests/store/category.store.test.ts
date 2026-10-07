import { describe, expect, it } from "vitest";

import {
  createCategorySignalStore,
  type CategorySignalStore,
} from "@/store/category.store";

function memoryStorage(backing = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  } as Storage;
}

function setup(backing = new Map<string, string>()): CategorySignalStore {
  return createCategorySignalStore({ getStorage: () => memoryStorage(backing) });
}

function seed(store: CategorySignalStore): string {
  const id = store.addCategory("Anime");
  store.addEntry(id, { type: "folder", name: "A", folderPath: "/a" });
  store.addEntry(id, { type: "folder", name: "B", folderPath: "/b" });
  store.addEntry(id, { type: "folder", name: "C", folderPath: "/c" });
  return id;
}

describe("category signal entries", () => {
  it("trims names and rejects empties and duplicates on rename", () => {
    const store = setup();
    const id = seed(store);
    store.renameCategory(id, "  Spaced  ");
    expect(store.atoms.categories.get()[0].name).toBe("Spaced");
    store.addCategory("Other");
    store.renameCategory(id, "other");
    expect(store.atoms.categories.get()[0].name).toBe("Spaced");
    store.renameCategory(id, "   ");
    expect(store.atoms.categories.get()[0].name).toBe("Spaced");
    store.persistor.dispose();
  });

  it("moves an entry up and down", () => {
    const store = setup();
    const id = seed(store);
    const ids = () => store.atoms.entries.get()[id].map((entry) => entry.name);
    expect(ids()).toEqual(["A", "B", "C"]);
    store.moveEntry(id, store.atoms.entries.get()[id][2].id, -1);
    expect(ids()).toEqual(["A", "C", "B"]);
    store.moveEntry(id, store.atoms.entries.get()[id][0].id, -1);
    expect(ids()).toEqual(["A", "C", "B"]);
    store.persistor.dispose();
  });
});
