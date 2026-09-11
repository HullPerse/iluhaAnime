import { DEFAULT_FILTERS } from "@/config/collection/filters.config";
import { parseIntent } from "@/lib/search/intent.utils";
import { useSettingsStore } from "@/store/settings.store";
import type {
  CollectionFilters,
  CollectionItem,
  CollectionStatus,
  FilterParams,
} from "@/types/collection";
import type { DateCond, NumericCond, ParsedIntent } from "@/types/search";

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

function compareNumber(value: number, op: NumericCond["op"], target: number): boolean {
  if (op === ">") return value > target;
  if (op === ">=") return value >= target;
  if (op === "<") return value < target;
  if (op === "<=") return value <= target;
  return value !== target;
}

function compareIsoDate(value: string, op: DateCond["op"], target: string): boolean {
  if (op === "=") return value === target;
  if (op === "!=") return value !== target;
  if (op === ">") return value > target;
  if (op === ">=") return value >= target;
  if (op === "<") return value < target;
  return value <= target;
}

function matchDateCond(item: CollectionItem, cond: DateCond): boolean {
  if (cond.yearOnly) {
    const year = item.year ?? (item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : null);
    if (year == null || !Number.isInteger(year)) return false;
    if (cond.op === "=") return year === Number(cond.iso);
    return compareNumber(year, cond.op, Number(cond.iso));
  }
  if (item.releaseDate == null) return false;
  return compareIsoDate(item.releaseDate, cond.op, cond.iso);
}

function splitOr(value: string): string[] {
  return value
    .split("|")
    .map((part) => part.toLowerCase().trim())
    .filter((part) => part.length > 0);
}

function applyIntentFilters(list: CollectionItem[], intent: ParsedIntent): CollectionItem[] {
  let out = list;
  if (intent.year !== undefined) out = out.filter((item) => item.year === intent.year);
  for (const cond of intent.yearOps) {
    out = out.filter((item) => item.year != null && compareNumber(item.year, cond.op, cond.value));
  }
  for (const cond of intent.dateConds) {
    out = out.filter((item) => matchDateCond(item, cond));
  }
  if (intent.genre) {
    const needles = splitOr(intent.genre);
    out = out.filter((item) =>
      item.genres.some((g) => needles.some((needle) => g.toLowerCase().includes(needle)))
    );
  }
  if (intent.studio) {
    const needles = splitOr(intent.studio);
    out = out.filter((item) =>
      needles.some((needle) => item.studio?.toLowerCase().includes(needle))
    );
  }
  if (intent.type) {
    const needles = splitOr(intent.type);
    out = out.filter((item) => needles.includes(item.type));
  }
  if (intent.status) {
    const needles = splitOr(intent.status);
    out = out.filter((item) => needles.includes(item.status));
  }
  if (intent.rating !== undefined)
    out = out.filter((item) => (item.rating ?? -1) >= intent.rating!);
  for (const cond of intent.ratingOps) {
    out = out.filter(
      (item) => item.rating != null && compareNumber(item.rating, cond.op, cond.value)
    );
  }
  if (intent.episodes !== undefined)
    out = out.filter((item) => item.progressTotal === intent.episodes);
  for (const cond of intent.episodesOps) {
    out = out.filter(
      (item) => item.progressTotal != null && compareNumber(item.progressTotal, cond.op, cond.value)
    );
  }
  if (intent.progress !== undefined)
    out = out.filter((item) => item.progressValue === intent.progress);
  for (const cond of intent.progressOps) {
    out = out.filter(
      (item) => item.progressValue != null && compareNumber(item.progressValue, cond.op, cond.value)
    );
  }
  if (intent.priority) {
    const needles = splitOr(intent.priority);
    out = out.filter((item) => needles.includes(item.priority.toLowerCase()));
  }
  if (intent.provider) {
    const needles = splitOr(intent.provider);
    out = out.filter((item) =>
      needles.some((p) => {
        if (p === "custom")
          return item.externalIds.anilist == null && item.externalIds.tmdb == null;
        if (p === "anilist" || p === "tmdb")
          return item.externalIds[p as "anilist" | "tmdb"] != null;
        return false;
      })
    );
  }
  for (const negation of intent.negations) {
    out = applyNegation(out, negation.key, negation.value);
  }
  return out;
}

function applyNegation(list: CollectionItem[], key: string, value: string): CollectionItem[] {
  const needles = splitOr(value);
  if (key === "type") return list.filter((item) => !needles.includes(item.type));
  if (key === "status") return list.filter((item) => !needles.includes(item.status));
  if (key === "priority")
    return list.filter((item) => !needles.includes(item.priority.toLowerCase()));
  if (key === "studio")
    return list.filter(
      (item) => !needles.some((needle) => item.studio?.toLowerCase().includes(needle) ?? false)
    );
  if (key === "genre")
    return list.filter(
      (item) => !item.genres.some((g) => needles.some((needle) => g.toLowerCase().includes(needle)))
    );
  if (key === "provider") {
    return list.filter(
      (item) =>
        !needles.some((needle) => {
          if (needle === "custom")
            return item.externalIds.anilist == null && item.externalIds.tmdb == null;
          if (needle === "anilist" || needle === "tmdb")
            return item.externalIds[needle as "anilist" | "tmdb"] != null;
          return false;
        })
    );
  }
  return list;
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
  sortBy: "date" | "name" | "rating" | "year",
  sortDir: "asc" | "desc"
): CollectionItem[] {
  return [...list].sort((left, right) => {
    const values = {
      date: left.updatedAt - right.updatedAt,
      name: left.title.localeCompare(right.title),
      rating: (left.rating ?? -1) - (right.rating ?? -1),
      year: (left.year ?? -1) - (right.year ?? -1),
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
  sortBy: "date" | "name" | "rating" | "year",
  sortDir: "asc" | "desc"
): CollectionItem[] {
  const intentEnabled = isIntentEnabled();
  const intent = intentEnabled
    ? parseIntent(searchQuery, useSettingsStore.getState().tagTolerances)
    : ({ cleanQuery: searchQuery, rawFilters: {} } as ReturnType<typeof parseIntent>);
  let list = resolveList(items, searchResults, intent.cleanQuery);
  if (selectedStatus !== "all") list = list.filter((item) => item.status === selectedStatus);
  if (intentEnabled) list = applyIntentFilters(list, intent);
  list = applyShortQueryFilter(list, intent.cleanQuery);
  list = applyCollectionFilters(list, filters);
  return sortCollectionItems(list, intent.sortBy ?? sortBy, intent.sortDir ?? sortDir);
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

export function freshDefaults(): CollectionFilters {
  return { ...DEFAULT_FILTERS, mediaTypes: [], genres: [] };
}

export function pickRandomItem(
  items: readonly CollectionItem[],
  rand: () => number = Math.random
): CollectionItem | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rand() * items.length)];
}
