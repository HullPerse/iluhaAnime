import type { PersistStorage, StorageValue } from "zustand/middleware";

import { attemptSync } from "@/lib/utils/attempt.utils";
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

  const persist = (name: string, value: StorageValue<S>, scope: string) => {
    const [, error] = attemptSync(() => resolveStorage().setItem(name, JSON.stringify(value)));
    if (error !== null) console.warn(`debouncedStorage: ${scope} of "${name}" failed`, error);
  };

  const flush = () => {
    for (const [name, entry] of pending) {
      window.clearTimeout(entry.timer);
      persist(name, entry.value, "flush");
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
      const [value, error] = attemptSync(() => JSON.parse(item) as StorageValue<S>);
      return error === null ? value : null;
    },
    setItem: (name, value) => {
      const existing = pending.get(name);
      if (existing) window.clearTimeout(existing.timer);
      pending.set(name, {
        timer: window.setTimeout(() => {
          pending.delete(name);
          persist(name, value, "write");
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
