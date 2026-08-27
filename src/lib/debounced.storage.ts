import type { PersistStorage, StorageValue } from "zustand/middleware";

interface PendingWrite<S> {
  timer: number;
  value: StorageValue<S>;
}

/**
 * A zustand persist storage that defers serialization and localStorage writes
 * until the write stream settles (or the page hides/unloads). Persisted state
 * like the search learning index can be large, so writing it synchronously on
 * every store mutation stalls the UI after each interaction.
 */
export function createDebouncedStorage<S>(
  getStorage: () => Storage,
  delay = 300
): PersistStorage<S> {
  const pending = new Map<string, PendingWrite<S>>();
  let storage: Storage | undefined;

  const resolveStorage = () => {
    storage ??= getStorage();
    return storage;
  };

  const flush = () => {
    for (const [name, entry] of pending) {
      window.clearTimeout(entry.timer);
      try {
        resolveStorage().setItem(name, JSON.stringify(entry.value));
      } catch {}
    }
    pending.clear();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => {
      const item = resolveStorage().getItem(name);
      if (item === null) return null;
      try {
        return JSON.parse(item) as StorageValue<S>;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      const existing = pending.get(name);
      if (existing) window.clearTimeout(existing.timer);
      pending.set(name, {
        timer: window.setTimeout(() => {
          pending.delete(name);
          try {
            resolveStorage().setItem(name, JSON.stringify(value));
          } catch {}
        }, delay),
        value,
      });
    },
    removeItem: (name) => {
      const existing = pending.get(name);
      if (existing) window.clearTimeout(existing.timer);
      pending.delete(name);
      resolveStorage().removeItem(name);
    },
  };
}
