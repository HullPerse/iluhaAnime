import { createSignalStore } from "@/lib/core/signal.store";
import type { Cell } from "@/types/core/signal";
import type { AnilistProgressOverride } from "@/types/anilist/anilistProgress";

const store = createSignalStore();
const cells = new Map<number, Cell<AnilistProgressOverride | null>>();

function cellFor(mediaId: number): Cell<AnilistProgressOverride | null> {
  const existing = cells.get(mediaId);
  if (existing) return existing;
  const created = store.cell<AnilistProgressOverride | null>(null);
  cells.set(mediaId, created);
  return created;
}

export const anilistProgressOverride = {
  cellFor,
  get: (mediaId: number): AnilistProgressOverride | null => cells.get(mediaId)?.get() ?? null,
  set: (mediaId: number, progress: number, status: string | null = null): void =>
    cellFor(mediaId).set({ progress, status }),
  clear: (mediaId: number): void => cellFor(mediaId).set(null),
  reset: (): void => {
    for (const cell of cells.values()) cell.set(null);
  },
};
