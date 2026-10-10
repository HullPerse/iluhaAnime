import { describe, expect, it } from "vitest";

import { coverKey, createCoverCorrectionsStore } from "@/store/cover.store";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("coverKey", () => {
  it("ignores case, punctuation, and defaults season", () => {
    expect(coverKey("Oshi No Ko")).toBe(coverKey("[Oshi no Ko]!", 0));
    expect(coverKey("Naruto", 1)).not.toBe(coverKey("Naruto", 2));
  });

  it("keeps cyrillic titles distinct", () => {
    expect(coverKey("Атака титанов")).not.toBe(coverKey("Наруто"));
    expect(coverKey("Атака титанов")).not.toBe("|0");
  });
});

describe("cover corrections store", () => {
  it("stores and removes overrides", () => {
    const storage = memoryStorage();
    const store = createCoverCorrectionsStore(() => storage);
    store.setOverride("naruto|0", { id: 20, coverUrl: "http://cover", title: "NARUTO", at: 1 });
    expect(store.atoms.overrides.get()["naruto|0"]?.id).toBe(20);
    store.removeOverride("naruto|0");
    expect(store.atoms.overrides.get()["naruto|0"]).toBeUndefined();
  });

  it("accumulates rejections without duplicates", () => {
    const storage = memoryStorage();
    const store = createCoverCorrectionsStore(() => storage);
    store.rejectCandidate("naruto|0", 20);
    store.rejectCandidate("naruto|0", 20);
    store.rejectCandidate("naruto|0", 1735);
    expect(store.atoms.rejections.get()["naruto|0"]).toEqual([20, 1735]);
  });

  it("restores persisted corrections", () => {
    const storage = memoryStorage();
    const first = createCoverCorrectionsStore(() => storage);
    first.setOverride("bleach|0", { id: 269, coverUrl: null, title: "BLEACH", at: 2 });
    first.rejectCandidate("bleach|0", 999);
    first.learnAlias("bleach|0", "BLEACH");
    first.flush();
    const second = createCoverCorrectionsStore(() => storage);
    expect(second.atoms.overrides.get()["bleach|0"]?.id).toBe(269);
    expect(second.atoms.rejections.get()["bleach|0"]).toEqual([999]);
    expect(second.atoms.aliases.get()["bleach|0"]).toBe("BLEACH");
  });

  it("ignores blank alias titles", () => {
    const storage = memoryStorage();
    const store = createCoverCorrectionsStore(() => storage);
    store.learnAlias("bleach|0", "   ");
    expect(store.atoms.aliases.get()["bleach|0"]).toBeUndefined();
  });
});

describe("resolved covers", () => {
  it("stores picks and evicts the oldest past the cap", () => {
    const storage = memoryStorage();
    const store = createCoverCorrectionsStore(() => storage);
    for (let index = 0; index < 502; index += 1) {
      store.setResolved(`title${index}|0`, {
        id: index,
        coverUrl: null,
        title: `T${index}`,
        at: index,
      });
    }
    const resolved = store.atoms.resolved.get();
    expect(Object.keys(resolved)).toHaveLength(500);
    expect(resolved["title0|0"]).toBeUndefined();
    expect(resolved["title1|0"]).toBeUndefined();
    expect(resolved["title501|0"]?.id).toBe(501);
  });

  it("drops the resolved entry on override, alias, and rejection", () => {
    const storage = memoryStorage();
    const store = createCoverCorrectionsStore(() => storage);
    store.setResolved("naruto|0", { id: 20, coverUrl: "http://cover", title: "NARUTO", at: 1 });
    store.setOverride("naruto|0", { id: 21, coverUrl: null, title: "OTHER", at: 2 });
    expect(store.atoms.resolved.get()["naruto|0"]).toBeUndefined();
    store.setResolved("naruto|0", { id: 20, coverUrl: "http://cover", title: "NARUTO", at: 3 });
    store.learnAlias("naruto|0", "NARUTO");
    expect(store.atoms.resolved.get()["naruto|0"]).toBeUndefined();
    store.setResolved("naruto|0", { id: 20, coverUrl: "http://cover", title: "NARUTO", at: 4 });
    store.rejectCandidate("naruto|0", 20);
    expect(store.atoms.resolved.get()["naruto|0"]).toBeUndefined();
  });

  it("removes a single resolved entry", () => {
    const storage = memoryStorage();
    const store = createCoverCorrectionsStore(() => storage);
    store.setResolved("naruto|0", { id: 20, coverUrl: null, title: "NARUTO", at: 1 });
    store.removeResolved("naruto|0");
    expect(store.atoms.resolved.get()["naruto|0"]).toBeUndefined();
  });

  it("persists resolved covers and blob ids across restarts", () => {
    const storage = memoryStorage();
    const first = createCoverCorrectionsStore(() => storage);
    first.setResolved("frieren|1", {
      id: 222,
      coverUrl: "http://cover/f",
      title: "Frieren",
      at: 5,
    });
    first.setBlob("http://cover/f", "blob9");
    first.flush();
    const second = createCoverCorrectionsStore(() => storage);
    expect(second.atoms.resolved.get()["frieren|1"]?.id).toBe(222);
    expect(second.atoms.blobs.get()["http://cover/f"]).toBe("blob9");
  });

  it("caps the blob map", () => {
    const storage = memoryStorage();
    const store = createCoverCorrectionsStore(() => storage);
    for (let index = 0; index < 502; index += 1) {
      store.setBlob(`http://cover/${index}`, `blob${index}`);
    }
    const blobs = store.atoms.blobs.get();
    expect(Object.keys(blobs)).toHaveLength(500);
    expect(blobs["http://cover/0"]).toBeUndefined();
    expect(blobs["http://cover/501"]).toBe("blob501");
  });

  it("drops resolved covers from pre-v3 envelopes but keeps the rest", () => {
    const storage = memoryStorage();
    storage.setItem(
      "iluha.v1.coverCorrections",
      JSON.stringify({
        f: 1,
        store: "coverCorrections",
        sv: 2,
        ts: 1,
        data: {
          overrides: { "naruto|0": { id: 20, coverUrl: null, title: "NARUTO", at: 1 } },
          rejections: {},
          aliases: {},
          resolved: { "frieren|1": { id: 1, coverUrl: "http://old", title: "OLD", at: 1 } },
          blobs: { "http://cover/f": "blob9" },
        },
      })
    );
    const store = createCoverCorrectionsStore(() => storage);
    expect(store.atoms.resolved.get()).toEqual({});
    expect(store.atoms.overrides.get()["naruto|0"]?.id).toBe(20);
    expect(store.atoms.blobs.get()["http://cover/f"]).toBe("blob9");
  });
});
