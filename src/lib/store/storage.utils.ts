import type { PersistStorage, StorageValue } from "zustand/middleware";

import { Debouncer } from "@/lib/pacer/debounce.utils";
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
    const entries = [...pending];
    pending.clear();
    for (const [name, entry] of entries) {
      entry.task.cancel();
      persist(name, entry.value, "flush");
    }
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
      pending.get(name)?.task.cancel();
      const task = new Debouncer<[]>(() => {
        pending.delete(name);
        persist(name, value, "write");
      }, { wait: delay });
      pending.set(name, { task, value });
      task.maybeExecute();
    },
    removeItem: (name) => {
      pending.get(name)?.task.cancel();
      pending.delete(name);
      resolveStorage().removeItem(name);
    },
  };
}
