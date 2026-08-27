import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageValue } from "zustand/middleware";

import { createDebouncedStorage } from "@/lib/debounced.storage";

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
    expect(storage.setItem).toHaveBeenCalledWith(
      "search",
      JSON.stringify(value())
    );
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

    // Pending map is drained: advancing timers does not write again.
    vi.advanceTimersByTime(300);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
