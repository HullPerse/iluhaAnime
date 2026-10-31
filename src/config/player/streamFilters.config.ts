import type { TranslationKey } from "@/types/core/i18n";
import type { StreamCatalogFilters, StreamGenreOption, StreamSortBy } from "@/types/player/stream";

export const DEFAULT_STREAM_FILTERS: StreamCatalogFilters = {
  types: [],
  genres: [],
  statuses: [],
  ageRatings: [],
  yearMin: null,
  yearMax: null,
  episodesMin: null,
  episodesMax: null,
  sortBy: "rating_score",
  sortType: "desc",
  adult: false,
};

export const STREAM_YEAR_MIN = 1960;
export function streamYearMax(): number {
  return new Date().getFullYear() + 1;
}
export const STREAM_EPISODES_MAX = 2000;

export const STREAM_ORDER_LABELS: Record<StreamSortBy, TranslationKey> = {
  rating_score: "stream.filters.sort.rating",
  views: "stream.sort.popular",
  name: "stream.filters.sort.name",
  created_at: "stream.sort.latest",
};

export function countActiveStreamFilters(filters: StreamCatalogFilters): number {
  let count =
    filters.types.length +
    filters.genres.length +
    filters.statuses.length +
    filters.ageRatings.length;
  if (filters.adult) count += 1;
  if (filters.yearMin !== null || filters.yearMax !== null) count += 1;
  if (filters.episodesMin !== null || filters.episodesMax !== null) count += 1;
  return count;
}

export function streamFiltersKey(filters: StreamCatalogFilters): string {
  return JSON.stringify({
    ...filters,
    types: [...filters.types].sort((a, b) => a - b),
    genres: [...filters.genres].sort((a, b) => a - b),
    statuses: [...filters.statuses].sort((a, b) => a - b),
    ageRatings: [...filters.ageRatings].sort((a, b) => a - b),
  });
}

export function withoutAdultFilters(
  filters: StreamCatalogFilters,
  genres: StreamGenreOption[]
): StreamCatalogFilters {
  const adultIds = new Set(genres.filter((genre) => genre.adult).map((genre) => genre.id));
  return {
    ...filters,
    adult: false,
    ageRatings: filters.ageRatings.filter((id) => id !== 5),
    genres: filters.genres.filter((id) => !adultIds.has(id)),
  };
}

export function isAdultAgeRating(id: number): boolean {
  return id === 5;
}
