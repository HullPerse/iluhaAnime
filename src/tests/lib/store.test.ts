import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageValue } from "zustand/middleware";

import { deleteAppCache, readAppCache, writeAppCache } from "@/lib/store/cache.utils";
import type { MigrationTransform } from "@/lib/store/migrate.utils";
import { resolveWithDefaults, runTransforms } from "@/lib/store/migrate.utils";
import { createDebouncedStorage } from "@/lib/store/storage.utils";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

describe("store/cache", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readAppCache", () => {
    it("parses the stored payload JSON", async () => {
      invokeMock.mockResolvedValue({
        expires_at: null,
        key: "folderTrees",
        namespace: "player",
        payload: '[{"path":"C:\\\\Anime"}]',
        updated_at: 1234,
      });

      const record = await readAppCache<{ path: string }[]>("player", "folderTrees");

      expect(invokeMock).toHaveBeenCalledWith("get_app_cache", {
        key: "folderTrees",
        namespace: "player",
      });
      expect(record).toEqual({
        expires_at: null,
        key: "folderTrees",
        namespace: "player",
        payload: [{ path: "C:\\Anime" }],
        updated_at: 1234,
      });
    });

    it("returns null when nothing is stored", async () => {
      invokeMock.mockResolvedValue(null);
      expect(await readAppCache("player", "missing")).toBeNull();
    });

    it("returns null when the native command is unavailable", async () => {
      invokeMock.mockRejectedValue(new Error("command not found"));
      expect(await readAppCache("player", "folderTrees")).toBeNull();
    });
  });

  describe("writeAppCache", () => {
    it("sends the payload as JSON and reports success", async () => {
      invokeMock.mockResolvedValue(undefined);

      const ok = await writeAppCache<{ n: number }>("search", "learning", {
        n: 5,
      });

      expect(invokeMock).toHaveBeenCalledWith("put_app_cache", {
        key: "learning",
        namespace: "search",
        payload: '{"n":5}',
        ttlSeconds: null,
      });
      expect(ok).toBe(true);
    });

    it("forwards the ttl", async () => {
      invokeMock.mockResolvedValue(undefined);
      await writeAppCache("search", "learning", { n: 1 }, 60);
      expect(invokeMock).toHaveBeenCalledWith("put_app_cache", {
        key: "learning",
        namespace: "search",
        payload: '{"n":1}',
        ttlSeconds: 60,
      });
    });

    it("reports failure when the command rejects", async () => {
      invokeMock.mockRejectedValue(new Error("write failed"));
      expect(await writeAppCache("search", "learning", { n: 1 })).toBe(false);
    });
  });

  describe("deleteAppCache", () => {
    it("deletes a single key", async () => {
      invokeMock.mockResolvedValue(undefined);
      expect(await deleteAppCache("torrent", "lastSaveDir")).toBe(true);
      expect(invokeMock).toHaveBeenCalledWith("delete_app_cache", {
        key: "lastSaveDir",
        namespace: "torrent",
      });
    });

    it("reports failure when the command rejects", async () => {
      invokeMock.mockRejectedValue(new Error("boom"));
      expect(await deleteAppCache("torrent", "x")).toBe(false);
    });
  });
});

describe("store/migrate", () => {
  const DEFAULTS = {
    count: 3,
    label: "all",
    nested: { keep: 1, fill: 2 },
    list: ["a"],
    maybe: null as string | null,
  };

  describe("resolveWithDefaults", () => {
    it("fills missing primitives with defaults", () => {
      expect(resolveWithDefaults({}, DEFAULTS)).toEqual(DEFAULTS);
    });

    it("keeps persisted values", () => {
      const resolved = resolveWithDefaults({ count: 9, label: "x" }, DEFAULTS);
      expect(resolved.count).toBe(9);
      expect(resolved.label).toBe("x");
    });

    it("resets wrong-type values to defaults", () => {
      const resolved = resolveWithDefaults({ count: "nine", label: 7 }, DEFAULTS);
      expect(resolved.count).toBe(3);
      expect(resolved.label).toBe("all");
    });

    it("drops unknown keys", () => {
      const resolved = resolveWithDefaults({ count: 1, removed: true }, DEFAULTS);
      expect("removed" in resolved).toBe(false);
    });

    it("deep-merges nested objects", () => {
      const resolved = resolveWithDefaults({ nested: { keep: 9 } }, DEFAULTS) as {
        nested: { keep: number; fill: number };
      };
      expect(resolved.nested).toEqual({ keep: 9, fill: 2 });
    });

    it("resets a non-object to the default object", () => {
      const resolved = resolveWithDefaults({ nested: 5 }, DEFAULTS) as {
        nested: { keep: number; fill: number };
      };
      expect(resolved.nested).toEqual({ keep: 1, fill: 2 });
    });

    it("replaces arrays wholesale and resets non-arrays", () => {
      expect(resolveWithDefaults({ list: ["b", "c"] }, DEFAULTS).list).toEqual(["b", "c"]);
      expect(resolveWithDefaults({ list: "b" }, DEFAULTS).list).toEqual(["a"]);
    });

    it("fills undefined null-defaults with null and keeps values", () => {
      expect(resolveWithDefaults({}, DEFAULTS).maybe).toBeNull();
      expect(resolveWithDefaults({ maybe: "k" }, DEFAULTS).maybe).toBe("k");
    });

    it("rejects values that fail a validator", () => {
      const validators = { label: (value: unknown) => value === "all" || value === "x" };
      expect(resolveWithDefaults({ label: "bogus" }, DEFAULTS, validators).label).toBe("all");
      expect(resolveWithDefaults({ label: "x" }, DEFAULTS, validators).label).toBe("x");
    });
  });

  describe("runTransforms", () => {
    it("runs transforms in order when the version is older", () => {
      const order: string[] = [];
      const transforms: MigrationTransform[] = [
        {
          from: 3,
          migrate: () => {
            order.push("a");
          },
        },
        {
          from: 5,
          migrate: () => {
            order.push("b");
          },
        },
      ];
      runTransforms({}, 2, transforms);
      expect(order).toEqual(["a", "b"]);
    });

    it("skips transforms the persisted version already passed", () => {
      const order: string[] = [];
      const transforms: MigrationTransform[] = [
        {
          from: 3,
          migrate: () => {
            order.push("a");
          },
        },
        {
          from: 5,
          migrate: (s) => {
            s.touched = true;
          },
        },
      ];
      const state = runTransforms({}, 4, transforms);
      expect(order).toEqual([]);
      expect(state.touched).toBe(true);
    });

    it("always runs ungated transforms", () => {
      let runs = 0;
      runTransforms({}, 99, [
        {
          migrate: () => {
            runs++;
          },
        },
      ]);
      expect(runs).toBe(1);
    });
  });
});

describe("store/storage", () => {
  function makeStorage() {
    const map = new Map<string, string>();
    return {
      clear: () => map.clear(),
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      get length() {
        return map.size;
      },
      removeItem: vi.fn((key: string) => map.delete(key)),
      setItem: vi.fn((key: string, value: string) => map.set(key, value)),
    } as unknown as Storage;
  }

  function value(overrides: Partial<StorageValue<{ n: number }>> = {}) {
    return { state: { n: 1 }, version: 0, ...overrides };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("createDebouncedStorage", () => {
    it("defers writes until the delay elapses", () => {
      const storage = makeStorage();
      const debounced = createDebouncedStorage(() => storage, 300);

      debounced.setItem("search", value());

      expect(storage.setItem).not.toHaveBeenCalled();

      vi.advanceTimersByTime(299);
      expect(storage.setItem).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenCalledWith("search", JSON.stringify(value()));
    });

    it("coalesces rapid writes to the same key into one", () => {
      const storage = makeStorage();
      const debounced = createDebouncedStorage(() => storage, 300);

      debounced.setItem("search", value({ state: { n: 1 } }));
      vi.advanceTimersByTime(100);
      debounced.setItem("search", value({ state: { n: 2 } }));
      vi.advanceTimersByTime(100);
      debounced.setItem("search", value({ state: { n: 3 } }));

      vi.advanceTimersByTime(300);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenCalledWith(
        "search",
        JSON.stringify(value({ state: { n: 3 } }))
      );
    });

    it("writes different keys independently", () => {
      const storage = makeStorage();
      const debounced = createDebouncedStorage(() => storage, 300);

      debounced.setItem("a", value({ state: { n: 1 } }));
      vi.advanceTimersByTime(150);
      debounced.setItem("b", value({ state: { n: 2 } }));
      vi.advanceTimersByTime(150);

      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenLastCalledWith(
        "a",
        JSON.stringify(value({ state: { n: 1 } }))
      );

      vi.advanceTimersByTime(150);
      expect(storage.setItem).toHaveBeenCalledTimes(2);
      expect(storage.setItem).toHaveBeenLastCalledWith(
        "b",
        JSON.stringify(value({ state: { n: 2 } }))
      );
    });

    it("reads stored values and tolerates missing or corrupt entries", () => {
      const storage = makeStorage();
      const debounced = createDebouncedStorage(() => storage);

      expect(debounced.getItem("missing")).toBeNull();

      storage.setItem("valid", JSON.stringify(value()));
      expect(debounced.getItem("valid")).toEqual(value());

      storage.setItem("corrupt", "not json");
      expect(debounced.getItem("corrupt")).toBeNull();
    });

    it("cancels a pending write on removeItem", () => {
      const storage = makeStorage();
      const debounced = createDebouncedStorage(() => storage, 300);

      debounced.setItem("search", value());
      debounced.removeItem("search");

      vi.advanceTimersByTime(300);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).toHaveBeenCalledWith("search");
    });

    it("flushes pending writes when the page hides", () => {
      const storage = makeStorage();
      const debounced = createDebouncedStorage(() => storage, 300);

      debounced.setItem("search", value());
      expect(storage.setItem).not.toHaveBeenCalled();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      try {
        document.dispatchEvent(new Event("visibilitychange"));
      } finally {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
      }
      expect(storage.setItem).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(300);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
    });
  });
});
