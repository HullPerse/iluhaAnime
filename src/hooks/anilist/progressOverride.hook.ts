import { useMemo } from "react";

import { useCell } from "@/lib/core/signal.hook";
import { anilistProgressOverride } from "@/store/anilistProgress.store";
import type { AnilistProgressOverride } from "@/types/anilist/anilistProgress";

export function useProgressOverride(mediaId: number): AnilistProgressOverride | null {
  const cell = useMemo(() => anilistProgressOverride.cellFor(mediaId), [mediaId]);
  return useCell(cell);
}
