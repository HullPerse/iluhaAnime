import type { PrefetchItem, PrefetchProgressPayload, PrefetchSummary } from "@/types/anilist";

export function formatProgressLog(items: PrefetchItem[], noRelations: string): string[] {
  return items.flatMap((item) =>
    item.relations.length === 0
      ? [`${item.title} → ${noRelations}`]
      : item.relations.map((relation) => `${item.title} → ${relation}`)
  );
}

export function getCachePercentages(
  progress: PrefetchProgressPayload | null,
  finished: PrefetchSummary | null
) {
  const fetched = progress?.fetched ?? finished?.fetched ?? 0;
  const skipped = progress?.skipped ?? finished?.skipped ?? 0;
  const total = fetched + skipped;
  const cached = total > 0 ? Math.round((skipped / total) * 100) : 0;
  return {
    fetched,
    skipped,
    cached,
    fetchedPercent: total > 0 ? 100 - cached : 0,
  };
}
