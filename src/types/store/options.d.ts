export interface SignalStoreOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}
