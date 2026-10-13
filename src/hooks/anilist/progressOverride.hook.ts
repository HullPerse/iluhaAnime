import { useMemo } from "react";

import { useCell } from "@/lib/state/signal.hook";
import { anilistProgressOverride } from "@/store/anilistProgress.store";

/**
 * Reads the pending optimistic progress for one media id. Returns `null` when
 * there is no local change, so callers fall back to the server value. The
 * subscription is scoped to this one media id, so a click re-renders this card
 * and nothing else in the list.
 */
export function useProgressOverride(mediaId: number): number | null {
  const cell = useMemo(() => anilistProgressOverride.cellFor(mediaId), [mediaId]);
  return useCell(cell);
}
