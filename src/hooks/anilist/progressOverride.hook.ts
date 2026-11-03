import { useMemo } from "react";

import { useCell } from "@hullperse/hp_utils/react";
import { anilistProgressOverride } from "@/store/anilistProgress.store";
import type { AnilistProgressOverride } from "@/types/anilist/anilistProgress";

export function useProgressOverride(mediaId: number): AnilistProgressOverride | null {
  const cell = useMemo(() => anilistProgressOverride.cellFor(mediaId), [mediaId]);
  return useCell(cell);
}
