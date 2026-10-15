import { useMemo } from "react";

import { useCell } from "@/lib/state/signal.hook";
import { anilistProgressOverride } from "@/store/anilistProgress.store";

export function useProgressOverride(mediaId: number): number | null {
  const cell = useMemo(() => anilistProgressOverride.cellFor(mediaId), [mediaId]);
  return useCell(cell);
}
