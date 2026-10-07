import { afterEach, describe, expect, it, vi } from "vitest";

import { createPersistor, persistKey } from "@/lib/state/persist.utils";

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
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("persist envelope", () => {
  it("namespaces keys per store", () => {
    expect(persistKey("settings")).toBe("iluha.v1.settings");
  });

  it("writes the exact wire format on flush", () => {
    const backing = new Map<string, string>();
    const storage = memoryStorage(backing);
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => storage,
      now: () => 1700000000000,
    });
    persistor.write({ pageSize: 40 });
    persistor.flush();
    expect(backing.get("iluha.v1.settings")).toBe(
      JSON.stringify({
        f: 1,
        store: "settings",
        sv: 37,
        ts: 1700000000000,
        data: { pageSize: 40 },
      })
    );
  });

  it("roundtrips written data with its schema version", () => {
    const storage = memoryStorage();
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => storage,
    });
    persistor.write({ pageSize: 40 });
    persistor.flush();
    expect(persistor.read()).toEqual({ data: { pageSize: 40 }, schemaVersion: 37 });
  });
});

describe("persist read recovery", () => {
  it("returns null when nothing was stored and no fallback exists", () => {
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => memoryStorage(),
    });
    expect(persistor.read()).toBeNull();
  });

  it("uses the fallback when the new key is missing", () => {
    const fallback = { data: { pageSize: 10 }, schemaVersion: 14 };
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => memoryStorage(),
      fallback: () => fallback,
    });
    expect(persistor.read()).toEqual(fallback);
  });

  it("prefers fresh data over the fallback", () => {
    const storage = memoryStorage();
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => storage,
      fallback: () => ({ data: { pageSize: 10 }, schemaVersion: 14 }),
    });
    persistor.write({ pageSize: 40 });
    persistor.flush();
    expect(persistor.read()).toEqual({ data: { pageSize: 40 }, schemaVersion: 37 });
  });

  it.each([
    ["malformed json", "{not json"],
    ["wrong store name", JSON.stringify({ f: 1, store: "other", sv: 1, ts: 0, data: {} })],
    ["wrong format version", JSON.stringify({ f: 999, store: "settings", sv: 1, ts: 0, data: {} })],
    ["non-object data", JSON.stringify({ f: 1, store: "settings", sv: 1, ts: 0, data: [1] })],
    ["missing data", JSON.stringify({ f: 1, store: "settings", sv: 1, ts: 0 })],
  ])("recovers to fallback on %s", (_label, raw) => {
    const backing = new Map<string, string>([["iluha.v1.settings", raw]]);
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => memoryStorage(backing),
      fallback: () => ({ data: { pageSize: 10 }, schemaVersion: 14 }),
    });
    expect(persistor.read()).toEqual({ data: { pageSize: 10 }, schemaVersion: 14 });
  });
});

describe("persist write scheduling", () => {
  it("debounces trailing writes with fake timers", () => {
    vi.useFakeTimers();
    const backing = new Map<string, string>();
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => memoryStorage(backing),
      debounceMs: 250,
    });
    persistor.write({ pageSize: 1 });
    persistor.write({ pageSize: 2 });
    expect(backing.has("iluha.v1.settings")).toBe(false);
    vi.advanceTimersByTime(250);
    expect(JSON.parse(backing.get("iluha.v1.settings") ?? "").data).toEqual({ pageSize: 2 });
    persistor.dispose();
  });

  it("drops pending writes on dispose", () => {
    vi.useFakeTimers();
    const backing = new Map<string, string>();
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => memoryStorage(backing),
      debounceMs: 250,
    });
    persistor.write({ pageSize: 1 });
    persistor.dispose();
    vi.advanceTimersByTime(1000);
    expect(backing.has("iluha.v1.settings")).toBe(false);
  });
});

describe("persist storage failures", () => {
  it("reports write errors without throwing", () => {
    const seen: Array<{ scope: string; error: unknown }> = [];
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => storage,
      onError: (scope, error) => {
        seen.push({ scope, error });
      },
    });
    expect(() => {
      persistor.write({ pageSize: 1 });
      persistor.flush();
    }).not.toThrow();
    expect(seen.map((entry) => entry.scope)).toEqual(["persist.write"]);
  });

  it("reports missing storage access without throwing", () => {
    const seen: string[] = [];
    const persistor = createPersistor({
      storeName: "settings",
      schemaVersion: 37,
      getStorage: () => {
        throw new Error("denied");
      },
      onError: (scope) => {
        seen.push(scope);
      },
    });
    expect(persistor.read()).toBeNull();
    expect(seen).toEqual(["persist.storage"]);
  });
});
