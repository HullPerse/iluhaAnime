import { defaultFilters } from "@/config/anilistFilters.config";
import type { AniListFilters } from "@/types/anilist";

export function defaultAniListFilters(adult: boolean): AniListFilters {
  return { ...defaultFilters, adult };
}

function isRanged(range: [number, number]): boolean {
  return range[0] !== 0 || range[1] !== 0;
}

export function countActiveAnilistFilters(filters: AniListFilters): number {
  let count = filters.tags.length + filters.genres.length;
  if (filters.format) count += 1;
  if (filters.status) count += 1;
  if (filters.season) count += 1;
  if (filters.seasonYear !== null) count += 1;
  if (filters.adult) count += 1;
  if (filters.sort) count += 1;
  if (filters.source) count += 1;
  if (filters.country) count += 1;
  if (isRanged(filters.year)) count += 1;
  if (isRanged(filters.episodes)) count += 1;
  if (isRanged(filters.score)) count += 1;
  return count;
}

export function countLocalAnilistFilters(filters: AniListFilters): number {
  let count = filters.tags.length + filters.genres.length;
  if (filters.format) count += 1;
  if (filters.status) count += 1;
  if (filters.season) count += 1;
  if (filters.seasonYear !== null) count += 1;
  if (isRanged(filters.year)) count += 1;
  if (isRanged(filters.episodes)) count += 1;
  if (isRanged(filters.score)) count += 1;
  return count;
}

export function localFilterSignature(filters: AniListFilters): string {
  return JSON.stringify({
    episodes: filters.episodes,
    format: filters.format,
    genres: [...filters.genres].sort(),
    score: filters.score,
    season: filters.season,
    seasonYear: filters.seasonYear,
    status: filters.status,
    tags: [...filters.tags].sort(),
    year: filters.year,
  });
}
