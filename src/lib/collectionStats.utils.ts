import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

export function calculateCollectionStats(
  items: CollectionItem[],
  statuses: CollectionStatusDef[]
) {
  const byStatus: Record<string, number> = {};
  for (const s of statuses) byStatus[s.id] = 0;
  const ratingDistribution: Record<number, number> = {};
  const perYearHours: Record<number, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;
  let hours = 0;
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    if (item.rating != null) {
      ratingSum += item.rating;
      ratingCount++;
      ratingDistribution[item.rating] = (ratingDistribution[item.rating] ?? 0) + 1;
    }
    const minutesPerUnit = item.progressUnit === "minutes" ? 1 : (item.durationMinutes ?? 24);
    const itemHours = item.progressValue ? (minutesPerUnit * item.progressValue) / 60 : 0;
    hours += itemHours;
    if (item.year && itemHours > 0) perYearHours[item.year] = (perYearHours[item.year] ?? 0) + itemHours;
  }
  return {
    total: items.length,
    byStatus,
    avgRating: ratingCount ? Number((ratingSum / ratingCount).toFixed(1)) : null,
    hours: Math.round(hours),
    favoriteCount: items.filter((item) => item.isFavorite).length,
    ratingDistribution,
    perYearHours,
  };
}
