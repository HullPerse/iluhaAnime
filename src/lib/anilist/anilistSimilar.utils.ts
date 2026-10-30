import type { AniRecommendation } from "@/types/anilist/anilist";

export function strengthPercent(rating: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((rating / max) * 100);
}

export function itemMeta(
  item: AniRecommendation,
  episodesShort: string,
  withScore = false
): string {
  const parts = [item.format];
  if (item.episodes) parts.push(`${item.episodes}${episodesShort}`);
  if (withScore && item.score) parts.push(`★ ${item.score}`);
  return parts.filter((part): part is string => Boolean(part)).join(" - ");
}
