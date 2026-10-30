import { useMemo } from "react";

import { useCell } from "@/lib/signal.hook";
import {
  anilistProgressOverride,
  type AnilistProgressOverride,
} from "@/store/anilistProgress.store";

export function useProgressOverride(mediaId: number): AnilistProgressOverride | null {
  const cell = useMemo(() => anilistProgressOverride.cellFor(mediaId), [mediaId]);
  return useCell(cell);
}
