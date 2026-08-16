import { describe, expect, it, beforeEach } from "vitest";

import { useCategoryStore } from "@/store/category.store";

beforeEach(() => {
  useCategoryStore.setState({ categories: [], entries: {} });
});

describe("useCategoryStore categories", () => {
  it("adds a category and returns its id", () => {
    const id = useCategoryStore.getState().addCategory("Anime");
    const cat = useCategoryStore.getState().categories[0];
    expect(cat.id).toBe(id);
    expect(cat.name).toBe("Anime");
    expect(cat.icon).toBe("w98_directory_zipper.ico");
    expect(cat.order).toBe(0);
  });

  it("dedupes category names with a numeric suffix", () => {
    const s = useCategoryStore.getState();
    s.addCategory("Anime");
    s.addCategory("Anime");
    const names = useCategoryStore.getState().categories.map((c) => c.name);
    expect(names).toEqual(["Anime", "Anime (1)"]);
  });

  it("renames a category", () => {
    const id = useCategoryStore.getState().addCategory("Anime");
    useCategoryStore.getState().renameCategory(id, "Movies");
    expect(useCategoryStore.getState().categories[0].name).toBe("Movies");
  });

  it("changes a category icon", () => {
    const id = useCategoryStore.getState().addCategory("Anime");
    useCategoryStore.getState().changeIcon(id, "w2k_computer.ico");
    expect(useCategoryStore.getState().categories[0].icon).toBe(
      "w2k_computer.ico"
    );
  });

  it("removes a category along with its entries", () => {
    const id = useCategoryStore.getState().addCategory("Anime");
    useCategoryStore.getState().addEntry(id, {
      folderPath: "C:\\Anime",
      name: "Folder",
      type: "folder",
    });
    useCategoryStore.getState().removeCategory(id);
    const s = useCategoryStore.getState();
    expect(s.categories).toHaveLength(0);
    expect(s.entries[id]).toBeUndefined();
  });

  it("reorders categories", () => {
    const a = useCategoryStore.getState().addCategory("A");
    const b = useCategoryStore.getState().addCategory("B");
    useCategoryStore.getState().reorderCategories([b, a]);
    expect(useCategoryStore.getState().categories.map((c) => c.id)).toEqual([
      b,
      a,
    ]);
    expect(useCategoryStore.getState().categories[0].order).toBe(0);
    expect(useCategoryStore.getState().categories[1].order).toBe(1);
  });
});

describe("useCategoryStore entries", () => {
  function setup() {
    const id = useCategoryStore.getState().addCategory("Anime");
    return id;
  }

  it("adds folder and torrent entries", () => {
    const id = setup();
    useCategoryStore.getState().addEntry(id, {
      folderPath: "C:\\Anime",
      name: "Folder",
      type: "folder",
    });
    useCategoryStore.getState().addEntry(id, {
      infoHash: "abc",
      name: "Torrent",
      saveDir: "C:\\dl",
      torrentId: 1,
      totalBytes: 100,
      type: "torrent",
    });
    const entries = useCategoryStore.getState().entries[id];
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBeDefined();
    expect(entries[1].id).toBeDefined();
  });

  it("does not add duplicate torrent or folder entries", () => {
    const id = setup();
    const s = useCategoryStore.getState();
    s.addEntry(id, { folderPath: "C:\\Anime", name: "Folder", type: "folder" });
    s.addEntry(id, { folderPath: "C:\\Anime", name: "Folder", type: "folder" });
    s.addEntry(id, {
      infoHash: "abc",
      name: "T",
      torrentId: 1,
      type: "torrent",
    });
    s.addEntry(id, {
      infoHash: "abc",
      name: "T2",
      torrentId: 1,
      type: "torrent",
    });
    expect(useCategoryStore.getState().entries[id]).toHaveLength(2);
  });

  it("removes a single entry", () => {
    const id = setup();
    const s = useCategoryStore.getState();
    s.addEntry(id, { folderPath: "C:\\A", name: "A", type: "folder" });
    s.addEntry(id, { folderPath: "C:\\B", name: "B", type: "folder" });
    const entryId = useCategoryStore.getState().entries[id][0].id;
    useCategoryStore.getState().removeEntry(id, entryId);
    const remaining = useCategoryStore.getState().entries[id];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].folderPath).toBe("C:\\B");
  });

  it("removes entries by folder path across categories", () => {
    const a = setup();
    const b = useCategoryStore.getState().addCategory("Movies");
    useCategoryStore
      .getState()
      .addEntry(a, { folderPath: "C:\\Shared", name: "F", type: "folder" });
    useCategoryStore
      .getState()
      .addEntry(b, { folderPath: "C:\\Shared", name: "F", type: "folder" });
    useCategoryStore
      .getState()
      .addEntry(b, { folderPath: "C:\\Other", name: "G", type: "folder" });
    useCategoryStore.getState().removeEntriesByFolderPath("C:\\Shared");
    expect(useCategoryStore.getState().entries[a]).toHaveLength(0);
    expect(
      useCategoryStore.getState().entries[b].map((e) => e.folderPath)
    ).toEqual(["C:\\Other"]);
  });

  it("removes entries by torrent id", () => {
    const id = setup();
    useCategoryStore.getState().addEntry(id, {
      infoHash: "a",
      name: "T",
      torrentId: 7,
      type: "torrent",
    });
    useCategoryStore.getState().addEntry(id, {
      infoHash: "b",
      name: "T2",
      torrentId: 8,
      type: "torrent",
    });
    useCategoryStore.getState().removeEntriesByTorrentId(7);
    const remaining = useCategoryStore.getState().entries[id];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].torrentId).toBe(8);
  });
});
