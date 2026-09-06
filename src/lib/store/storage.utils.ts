import type { PersistStorage, StorageValue } from "zustand/middleware";

import type { PendingWrite } from "@/types/storage";

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
      } catch (error) {
        console.warn(`debouncedStorage: flush of "${name}" failed`, error);
      }
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
          } catch (error) {
            console.warn(`debouncedStorage: write of "${name}" failed`, error);
          }
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
