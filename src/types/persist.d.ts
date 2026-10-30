export interface PersistEnvelope {
  f: number;
  store: string;
  sv: number;
  ts: number;
  data: Record<string, unknown>;
}

export interface PersistedData {
  data: Record<string, unknown>;
  schemaVersion: number;
}

export interface PersistOptions {
  storeName: string;
  schemaVersion: number;
  getStorage: () => Storage | undefined;
  debounceMs?: number;
  fallback?: () => PersistedData | null;
  onError?: (scope: string, error: unknown) => void;
  now?: () => number;
}

export interface Persistor {
  write: (data: Record<string, unknown>) => void;
  flush: () => void;
  read: () => PersistedData | null;
  dispose: () => void;
}
