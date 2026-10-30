import type { WatcherDelay } from "@/types/ui/settings";

export const WATCHER_DEBOUNCE_MS: Record<WatcherDelay, number> = {
  fast: 400,
  calm: 1500,
};
