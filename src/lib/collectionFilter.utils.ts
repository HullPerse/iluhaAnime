import type { CollectionItem, CollectionStatus } from "@/types/collection";

type FilterParams = {
  ratingMin: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  provider: "any" | "anilist" | "tmdb" | "custom";
  linked: "any" | "yes" | "no";
  hasNote: "any" | "yes" | "no";
};

export function filterCollectionItems(
  items: CollectionItem[],
  searchResults: CollectionItem[],
  selectedStatus: CollectionStatus | "all",
  searchQuery: string,
  filters: FilterParams,
  sortBy: "date" | "name" | "rating",
  sortDir: "asc" | "desc"
): CollectionItem[] {
  let list = searchQuery.trim().length >= 3 ? searchResults : [...items];
  if (selectedStatus !== "all")
    list = list.filter((item) => item.status === selectedStatus);
  if (searchQuery.trim() && searchQuery.trim().length < 3) {
    const query = searchQuery.toLowerCase();
    list = list.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.altTitles.some((alt) => alt.toLowerCase().includes(query)) ||
        item.genres.some((genre) => genre.toLowerCase().includes(query)) ||
        Boolean(item.studio?.toLowerCase().includes(query))
    );
  }
  list = applyCollectionFilters(list, filters);
  return [...list].sort((left, right) => {
    const values = {
      // Ascending semantics like the other comparators: the sortDir
      // inversion below then makes desc = newest first (the default).
      date: left.updatedAt - right.updatedAt,
      name: left.title.localeCompare(right.title),
      rating: (left.rating ?? -1) - (right.rating ?? -1),
    };
    const result = values[sortBy];
    return sortDir === "asc" ? result : -result;
  });
}

export function applyCollectionFilters(items: CollectionItem[], filters: FilterParams): CollectionItem[] {
  let result = items;
  if (filters.ratingMin != null) result = result.filter((item) => (item.rating ?? 0) >= filters.ratingMin!);
  if (filters.yearFrom != null) result = result.filter((item) => item.year != null && item.year >= filters.yearFrom!);
  if (filters.yearTo != null) result = result.filter((item) => item.year != null && item.year <= filters.yearTo!);
  if (filters.provider !== "any") {
    if (filters.provider === "custom")
      result = result.filter((item) => item.externalIds.anilist == null && item.externalIds.tmdb == null);
    else {
      const provider = filters.provider as "anilist" | "tmdb";
      result = result.filter((item) => item.externalIds[provider] != null);
    }
  }
  if (filters.linked !== "any")
    result = result.filter((item) => (filters.linked === "yes" ? item.localPath != null : item.localPath == null));
  if (filters.hasNote !== "any")
    result = result.filter((item) =>
      filters.hasNote === "yes" ? Boolean(item.notes?.trim()) : !item.notes?.trim()
    );
  return result;
}
