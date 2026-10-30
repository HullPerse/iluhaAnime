import { useMemo } from "react";

import { useCell } from "@/lib/signal.hook";
import { anilistProgressOverride } from "@/store/anilistProgress.store";
import type { AnilistProgressOverride } from "@/types/anilistProgress";

export function useProgressOverride(mediaId: number): AnilistProgressOverride | null {
  const cell = useMemo(() => anilistProgressOverride.cellFor(mediaId), [mediaId]);
  return useCell(cell);
}
