import type { WatcherDelay } from "@/types/settings";

/** Aggregation window handed to the Rust folder watcher, in milliseconds. */
export const WATCHER_DEBOUNCE_MS: Record<WatcherDelay, number> = {
  fast: 400,
  calm: 1500,
};
