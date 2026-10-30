import type { TranslationKey } from "@/types/i18n";
import type { StreamCatalogFilters, StreamGenreOption, StreamSortBy } from "@/types/stream";

/** The default catalog view: the site's own popularity order, no filters. */
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
/** Upper bound of the year slider; the current year keeps the top open. */
export function streamYearMax(): number {
  return new Date().getFullYear() + 1;
}
export const STREAM_EPISODES_MAX = 2000;

export const STREAM_SORT_OPTIONS: readonly {
  value: StreamSortBy;
  labelKey: TranslationKey;
}[] = [
  { value: "rating_score", labelKey: "stream.filters.sort.rating" },
  { value: "views", labelKey: "stream.filters.sort.views" },
  { value: "name", labelKey: "stream.filters.sort.name" },
  { value: "created_at", labelKey: "stream.filters.sort.added" },
];

/** Number of filters the user changed from the default view. */
export function countActiveStreamFilters(filters: StreamCatalogFilters): number {
  let count =
    filters.types.length +
    filters.genres.length +
    filters.statuses.length +
    filters.ageRatings.length;
  if (filters.adult) count += 1;
  if (filters.yearMin !== null || filters.yearMax !== null) count += 1;
  if (filters.episodesMin !== null || filters.episodesMax !== null) count += 1;
  // Sort is not counted: it has its own bar and is never hidden behind this
  // modal, so it cannot be an invisible active filter.
  return count;
}

/**
 * A stable identity for the query cache. Selection order is not meaningful, so
 * the arrays are sorted before serialization and picking two genres in either
 * order reuses one cached page.
 */
export function streamFiltersKey(filters: StreamCatalogFilters): string {
  return JSON.stringify({
    ...filters,
    types: [...filters.types].sort((a, b) => a - b),
    genres: [...filters.genres].sort((a, b) => a - b),
    statuses: [...filters.statuses].sort((a, b) => a - b),
    ageRatings: [...filters.ageRatings].sort((a, b) => a - b),
  });
}

/** Remove the 18+ age rating and every adult genre from a selection. */
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

/** Whether an age rating row is the 18+ one. */
export function isAdultAgeRating(id: number): boolean {
  return id === 5;
}
