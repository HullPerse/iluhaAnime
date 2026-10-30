// Playback source selection. The source list arrives from the AnimeLib client
// as it was resolved; choosing which entry plays is a player concern, so the
// rules live here as pure functions instead of inside a component.

import type { StreamSource, StreamVariantSource } from "@/types/videoPlayer";

/** `1080` outranks `720`; a label without digits ranks last. */
export function qualityRank(label: string): number {
  const digits = label.replace(/\D/g, "");
  return digits.length > 0 ? Number(digits) : 0;
}

/** Highest quality first, stable for equal ranks. */
export function sortSourcesByQuality(sources: StreamSource[]): StreamSource[] {
  return [...sources].sort((left, right) => qualityRank(right.label) - qualityRank(left.label));
}

/**
 * The source to play. An exact label match wins. A missing quality degrades
 * downwards: the highest one that is no higher than the requested label, so a
 * remembered 1080p plays 720p instead of jumping above the request. When the
 * list has nothing that low, the lowest available one plays. Without a
 * preference the best source plays.
 */
export function pickSource(sources: StreamSource[], preferred?: string): StreamSource | null {
  if (sources.length === 0) return null;
  const sorted = sortSourcesByQuality(sources);
  if (!preferred) return sorted[0];
  const exact = sorted.find((source) => source.label === preferred);
  if (exact) return exact;
  const preferredRank = qualityRank(preferred);
  if (preferredRank <= 0) return sorted[0];
  const lower = sorted.find((source) => {
    const rank = qualityRank(source.label);
    return rank > 0 && rank <= preferredRank;
  });
  return lower ?? sorted.at(-1) ?? null;
}

/** The quality list the player window carries for a switch without re-resolving. */
export function toVariantSources(sources: StreamSource[]): StreamVariantSource[] {
  return sortSourcesByQuality(sources).map((source) => ({
    url: source.url,
    type: source.type,
    quality: source.quality,
    label: source.label,
  }));
}

/** The URL of a quality in an already resolved list, or null. */
export function variantSourceUrl(sources: StreamVariantSource[], label: string): string | null {
  return sources.find((source) => source.label === label)?.url ?? null;
}
