import { attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";

import {
  createPersistor,
  persistKey,
  type PersistedData,
  type Persistor,
} from "./persist.utils";
import { createSignalStore, type SignalStore } from "./signal.store";

export function defaultGetStorage(): Storage | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

export interface PersistedStoreOptions {
  storeName: string;
  short: string;
  schemaVersion: number;
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
  onFallback?: (getStorage: () => Storage | undefined) => PersistedData | null;
}

export interface PersistedStoreContext {
  store: SignalStore;
  persistor: Persistor;
  getStorage: () => Storage | undefined;
  adopted: () => boolean;
  finishAdopt: (
    snapshot?: () => Record<string, unknown>,
    keys?: { probe?: string; remove?: string }
  ) => void;
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
