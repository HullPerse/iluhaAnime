import { useSettingsStore } from "@/store/settings.store";
import type { CollectionFilters, CollectionItem, CollectionStatus } from "@/types/collection";

import { parseIntent, type ParsedIntent } from "./intentParser.utils";

type FilterParams = CollectionFilters;

function isIntentEnabled(): boolean {
  return useSettingsStore.getState().searchIntentEnabled;
}

function resolveList(
  items: CollectionItem[],
  searchResults: CollectionItem[],
  cleanQuery: string
): CollectionItem[] {
  return cleanQuery.trim().length >= 3 ? searchResults : items;
}

function applyIntentFilters(list: CollectionItem[], intent: ParsedIntent): CollectionItem[] {
  let out = list;
  if (intent.year !== undefined) out = out.filter((item) => item.year === intent.year);
  if (intent.genre) {
    const needle = intent.genre.toLowerCase();
    out = out.filter((item) => item.genres.some((g) => g.toLowerCase().includes(needle)));
  }
  if (intent.studio) {
    const needle = intent.studio.toLowerCase();
    out = out.filter((item) => item.studio?.toLowerCase().includes(needle));
  }
  if (intent.type) out = out.filter((item) => item.type === intent.type);
  if (intent.status) out = out.filter((item) => item.status === intent.status);
  if (intent.rating !== undefined)
    out = out.filter((item) => (item.rating ?? -1) >= intent.rating!);
  if (intent.priority)
    out = out.filter((item) => item.priority.toLowerCase() === intent.priority!.toLowerCase());
  if (intent.provider) {
    const p = intent.provider.toLowerCase();
    if (p === "custom")
      out = out.filter((item) => item.externalIds.anilist == null && item.externalIds.tmdb == null);
    else if (p === "anilist" || p === "tmdb")
      out = out.filter((item) => item.externalIds[p as "anilist" | "tmdb"] != null);
  }
  return out;
}

function matchesShortQuery(item: CollectionItem, query: string): boolean {
  return (
    item.title.toLowerCase().includes(query) ||
    item.altTitles.some((alt) => alt.toLowerCase().includes(query)) ||
    item.genres.some((genre) => genre.toLowerCase().includes(query)) ||
    Boolean(item.studio?.toLowerCase().includes(query))
  );
}

function applyShortQueryFilter(list: CollectionItem[], cleanQuery: string): CollectionItem[] {
  if (!cleanQuery.trim() || cleanQuery.trim().length >= 3) return list;
  const query = cleanQuery.toLowerCase();
  return list.filter((item) => matchesShortQuery(item, query));
}

function sortCollectionItems(
  list: CollectionItem[],
  sortBy: "date" | "name" | "rating",
  sortDir: "asc" | "desc"
): CollectionItem[] {
  return [...list].sort((left, right) => {
    const values = {
      date: left.updatedAt - right.updatedAt,
      name: left.title.localeCompare(right.title),
      rating: (left.rating ?? -1) - (right.rating ?? -1),
    };
    const result = values[sortBy];
    return sortDir === "asc" ? result : -result;
  });
}

export function filterCollectionItems(
  items: CollectionItem[],
  searchResults: CollectionItem[],
  selectedStatus: CollectionStatus | "all",
  searchQuery: string,
  filters: FilterParams,
  sortBy: "date" | "name" | "rating",
  sortDir: "asc" | "desc"
): CollectionItem[] {
  const intentEnabled = isIntentEnabled();
  const intent = intentEnabled
    ? parseIntent(searchQuery)
    : ({ cleanQuery: searchQuery, rawFilters: {} } as ReturnType<typeof parseIntent>);
  let list = resolveList(items, searchResults, intent.cleanQuery);
  if (selectedStatus !== "all") list = list.filter((item) => item.status === selectedStatus);
  if (intentEnabled) list = applyIntentFilters(list, intent);
  list = applyShortQueryFilter(list, intent.cleanQuery);
  list = applyCollectionFilters(list, filters);
  return sortCollectionItems(list, sortBy, sortDir);
}

function filterByRating(list: CollectionItem[], filters: FilterParams): CollectionItem[] {
  let out = list;
  if (filters.ratingMin != null)
    out = out.filter((item) => (item.rating ?? 0) >= filters.ratingMin!);
  if (filters.ratingMax != null)
    out = out.filter((item) => (item.rating ?? 0) <= filters.ratingMax!);
  return out;
}

function filterByYear(list: CollectionItem[], filters: FilterParams): CollectionItem[] {
  let out = list;
  if (filters.yearFrom != null)
    out = out.filter((item) => item.year != null && item.year >= filters.yearFrom!);
  if (filters.yearTo != null)
    out = out.filter((item) => item.year != null && item.year <= filters.yearTo!);
  return out;
}

function filterByProvider(
  list: CollectionItem[],
  provider: FilterParams["provider"]
): CollectionItem[] {
  if (provider === "any") return list;
  if (provider === "custom") {
    return list.filter((item) => item.externalIds.anilist == null && item.externalIds.tmdb == null);
  }
  const key = provider as "anilist" | "tmdb";
  return list.filter((item) => item.externalIds[key] != null);
}

function filterByFlags(list: CollectionItem[], filters: FilterParams): CollectionItem[] {
  let out = list;
  if (filters.linked !== "any")
    out = out.filter((item) =>
      filters.linked === "yes" ? item.localPath != null : item.localPath == null
    );
  if (filters.hasNote !== "any")
    out = out.filter((item) =>
      filters.hasNote === "yes" ? Boolean(item.notes?.trim()) : !item.notes?.trim()
    );
  return out;
}

export function applyCollectionFilters(
  items: CollectionItem[],
  filters: FilterParams
): CollectionItem[] {
  let result = filterByRating(items, filters);
  result = filterByYear(result, filters);
  result = filterByProvider(result, filters.provider);
  result = filterByFlags(result, filters);
  if (filters.mediaTypes?.length)
    result = result.filter((item) => filters.mediaTypes.includes(item.type));
  if (filters.genres?.length)
    result = result.filter((item) => filters.genres.some((g) => item.genres.includes(g)));
  return result;
}
