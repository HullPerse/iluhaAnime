import { createSignalStore, type Cell } from "@/lib/state/signal.store";

/**
 * Optimistic progress for a media entry, keyed by media id.
 *
 * The stepper writes here on every click instead of patching the
 * `["anilist_data"]` cache. That keeps the promise of the value surviving any
 * in-flight refetch (an overwrite of the cache does not touch this store) and
 * limits re-renders to the cards that subscribe to a given media id.
 *
 * The value is the intended progress while a save is pending; `null` means
 * "no local change, use the server value". It is cleared once the server
 * confirms (or when a save fails with nothing newer queued).
 */
const store = createSignalStore();
const cells = new Map<number, Cell<number | null>>();

function cellFor(mediaId: number): Cell<number | null> {
  const existing = cells.get(mediaId);
  if (existing) return existing;
  const created = store.cell<number | null>(null);
  cells.set(mediaId, created);
  return created;
}

export const anilistProgressOverride = {
  cellFor,
  get: (mediaId: number): number | null => cells.get(mediaId)?.get() ?? null,
  set: (mediaId: number, progress: number): void => cellFor(mediaId).set(progress),
  clear: (mediaId: number): void => cellFor(mediaId).set(null),
  reset: (): void => {
    for (const cell of cells.values()) cell.set(null);
  },
};
