import { createSignalStore, type Cell } from "@/lib/state/signal.store";

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
