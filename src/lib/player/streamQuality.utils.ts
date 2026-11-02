import { qualityRank } from "@/lib/search/sources.utils";
import type { StreamVariantSource } from "@/types/player/videoPlayer";

/**
 * The next quality down from `current`, or null when this is already the
 * lowest (or the current label is not part of the source list).
 *
 * Sources are stored highest-first, but the order is not relied on: the rank
 * from the label is what decides, so a reordered API response cannot make the
 * auto-downgrade pick a *higher* quality.
 */
export function lowerQualityLabel(
  sources: readonly StreamVariantSource[],
  current: string
): string | null {
  const currentRank = qualityRank(current);
  if (currentRank <= 0) return null;
  if (!sources.some((source) => source.label === current)) return null;
  let best: StreamVariantSource | null = null;
  for (const source of sources) {
    const rank = qualityRank(source.label);
    if (rank <= 0 || rank >= currentRank) continue;
    if (best === null || rank > qualityRank(best.label)) best = source;
  }
  return best?.label ?? null;
}
