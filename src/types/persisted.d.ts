import type { PersistedData, Persistor } from "@/types/persist";
import type { SignalStore } from "@/types/signal";

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
