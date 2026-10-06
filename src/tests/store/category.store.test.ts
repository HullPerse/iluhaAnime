import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

let useCategoryStore: (typeof import("@/store/category.store"))["useCategoryStore"];

beforeAll(async () => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      removeItem: (k: string) => storage.delete(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  const mod = await import("@/store/category.store");
  useCategoryStore = mod.useCategoryStore;
});

beforeEach(() => {
  storage.clear();
  useCategoryStore.setState({ categories: [], entries: {}, collapsedIds: [] });
});

function seed() {
  const store = useCategoryStore.getState();
  const id = store.addCategory("Anime");
  const api = useCategoryStore.getState();
  api.addEntry(id, { type: "folder", name: "A", folderPath: "/a" });
  api.addEntry(id, { type: "folder", name: "B", folderPath: "/b" });
  api.addEntry(id, { type: "folder", name: "C", folderPath: "/c" });
  return id;
}

describe("useCategoryStore entries", () => {
  it("trims names and rejects empties and duplicates on rename", () => {
    const id = seed();
    const store = useCategoryStore.getState();
    store.renameCategory(id, "  Spaced  ");
    expect(useCategoryStore.getState().categories[0].name).toBe("Spaced");
    store.addCategory("Other");
    store.renameCategory(id, "other");
    expect(useCategoryStore.getState().categories[0].name).toBe("Spaced");
    store.renameCategory(id, "   ");
    expect(useCategoryStore.getState().categories[0].name).toBe("Spaced");
  });

  it("moves an entry up and down", () => {
    const id = seed();
    const ids = () => useCategoryStore.getState().entries[id].map((entry) => entry.name);
    expect(ids()).toEqual(["A", "B", "C"]);
    useCategoryStore.getState().moveEntry(id, useCategoryStore.getState().entries[id][2].id, -1);
    expect(ids()).toEqual(["A", "C", "B"]);
    useCategoryStore.getState().moveEntry(id, useCategoryStore.getState().entries[id][0].id, -1);
    expect(ids()).toEqual(["A", "C", "B"]);
  });

  it("exports and reimports a roundtrip", () => {
    const id = seed();
    const json = useCategoryStore.getState().exportCategories();
    useCategoryStore.setState({ categories: [], entries: {} });
    const count = useCategoryStore.getState().importCategories(JSON.parse(json));
    expect(count).toBe(1);
    expect(useCategoryStore.getState().entries[id]).toHaveLength(3);
  });

  it("rejects invalid backups and skips bad rows", () => {
    expect(() => useCategoryStore.getState().importCategories(null)).toThrow();
    expect(() => useCategoryStore.getState().importCategories({})).toThrow();
    const count = useCategoryStore.getState().importCategories({
      categories: [
        { id: "c1", name: "Ok", icon: "i.ico" },
        { id: 5, name: "Bad" },
      ],
      entries: {
        c1: [
          { id: "e1", type: "folder", name: "A", folderPath: "/a" },
          { id: "e2", type: "nope", name: "B" },
        ],
        ghost: [{ id: "e3", type: "folder", name: "C" }],
      },
    });
    expect(count).toBe(1);
    expect(useCategoryStore.getState().entries["c1"]).toHaveLength(1);
    expect(useCategoryStore.getState().entries["ghost"]).toBeUndefined();
  });
});
