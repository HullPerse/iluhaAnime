import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

function initStatusCounts(statuses: CollectionStatusDef[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of statuses) map[s.id] = 0;
  return map;
}

function itemHours(item: CollectionItem): number {
  const minutesPerUnit = item.progressUnit === "minutes" ? 1 : (item.durationMinutes ?? 24);
  return item.progressValue ? (minutesPerUnit * item.progressValue) / 60 : 0;
}

function accumulateRating(
  item: CollectionItem,
  acc: { sum: number; count: number; dist: Record<number, number> }
): void {
  if (item.rating == null) return;
  acc.sum += item.rating;
  acc.count++;
  acc.dist[item.rating] = (acc.dist[item.rating] ?? 0) + 1;
}

export function calculateCollectionStats(items: CollectionItem[], statuses: CollectionStatusDef[]) {
  const byStatus = initStatusCounts(statuses);
  const ratingDist: Record<number, number> = {};
  const perYearHours: Record<number, number> = {};
  const ratingAcc = { sum: 0, count: 0, dist: ratingDist };
  let totalHours = 0;
  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    accumulateRating(item, ratingAcc);
    const hours = itemHours(item);
    totalHours += hours;
    if (item.year && hours > 0) perYearHours[item.year] = (perYearHours[item.year] ?? 0) + hours;
  }
  return {
    total: items.length,
    byStatus,
    avgRating: ratingAcc.count ? Number((ratingAcc.sum / ratingAcc.count).toFixed(1)) : null,
    hours: Math.round(totalHours),
    favoriteCount: items.filter((item) => item.isFavorite).length,
    ratingDistribution: ratingDist,
    perYearHours,
  };
}
