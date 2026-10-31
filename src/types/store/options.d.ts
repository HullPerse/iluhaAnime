export interface SignalStoreOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export type PlayerSignalOptions = SignalStoreOptions;
export type CategorySignalOptions = SignalStoreOptions;
export type ThemeSignalOptions = SignalStoreOptions;
export type AnilistSignalOptions = SignalStoreOptions;
