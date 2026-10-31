import { attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";

import { createPersistor, persistKey } from "@/lib/core/persist.utils";
import { createSignalStore } from "@/lib/core/signal.store";
import type { PersistedStoreContext, PersistedStoreOptions } from "@/types/core/persisted";
import type { Cell, SignalStore } from "@/types/core/signal";

export function defaultGetStorage(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export function bindMirroredAtom<T>(
  store: SignalStore,
  key: string,
  initial: T,
  mirror: Record<string, unknown>,
  serialize: (value: T) => unknown = (value) => value
): Cell<T> {
  const cell = store.atom(key, initial);
  return {
    id: cell.id,
    get: cell.get,
    set: (value) => {
      mirror[key] = serialize(value);
      cell.set(value);
    },
    update: (fn) => {
      const next = fn(cell.get());
      mirror[key] = serialize(next);
      cell.set(next);
    },
    subscribe: cell.subscribe,
  };
}

export function buildMirrorAtoms<T extends object>(
  store: SignalStore,
  data: T,
  mirror: Record<string, unknown>,
  serialize?: (value: unknown) => unknown
): { [K in keyof T]-?: Cell<T[K]> } {
  const atoms: Record<string, Cell<unknown>> = {};
  for (const [key, initial] of Object.entries(data)) {
    atoms[key] = bindMirroredAtom(store, key, initial, mirror, serialize);
  }
  return atoms as { [K in keyof T]-?: Cell<T[K]> };
}

export function buildSignalAtoms<T extends object>(
  store: SignalStore,
  data: T
): { [K in keyof T]-?: Cell<T[K]> } {
  const atoms: Record<string, Cell<unknown>> = {};
  for (const [key, initial] of Object.entries(data)) {
    atoms[key] = store.atom(key, initial);
  }
  return atoms as { [K in keyof T]-?: Cell<T[K]> };
}

export function createPersistedStoreContext(options: PersistedStoreOptions): PersistedStoreContext {
  const getStorage = options.getStorage ?? defaultGetStorage;
  const store = createSignalStore();
  let adoptedFromLegacy = false;
  const persistor = createPersistor({
    storeName: options.storeName,
    schemaVersion: options.schemaVersion,
    getStorage,
    debounceMs: options.debounceMs,
    fallback: options.onFallback
      ? () => {
          const migrated = options.onFallback?.(getStorage) ?? null;
          if (migrated) adoptedFromLegacy = true;
          return migrated;
        }
      : undefined,
    onError: (scope, error) =>
      reportBackgroundError(`${options.short}.signal.${scope}`, error as Error),
  });

  const finishAdopt = (
    snapshot?: () => Record<string, unknown>,
    keys?: { probe?: string; remove?: string }
  ): void => {
    if (!adoptedFromLegacy) return;
    const probeKey = keys?.probe ?? persistKey(options.storeName);
    const removeKey = keys?.remove ?? probeKey;
    if (snapshot) persistor.write(snapshot());
    persistor.flush();
    const [storage, storageError] = attemptSync(() => getStorage());
    if (storageError !== null) {
      reportBackgroundError(`${options.short}.signal.adopt`, storageError);
      return;
    }
    const [adopted, adoptError] = attemptSync(() => storage?.getItem(probeKey));
    if (adoptError !== null) {
      reportBackgroundError(`${options.short}.signal.adopt`, adoptError);
    } else if (adopted) {
      const [, removeError] = attemptSync(() => storage?.removeItem(removeKey));
      if (removeError !== null) reportBackgroundError(`${options.short}.signal.adopt`, removeError);
    }
  };

  return { store, persistor, getStorage, adopted: () => adoptedFromLegacy, finishAdopt };
}
