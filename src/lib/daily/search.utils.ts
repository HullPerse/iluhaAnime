import type { AniMedia } from "@/types/anilist/anilist";

/** The first non-primary title that contains the query, if any. */
export function matchingAlias(media: AniMedia, query: string): string | null {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return null;
  const primary = media.title.toLocaleLowerCase();
  return (
    media.titles.find((title) => {
      const value = title.toLocaleLowerCase();
      return value !== primary && value.includes(needle);
    }) ?? null
  );
}

/**
 * Relevance from 0 to 4: primary exact 4, primary prefix 3, primary contains
 * 2; alias exact 2, alias prefix or contains 1.
 */
export function titleMatchRank(media: AniMedia, query: string): number {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return 0;
  const primary = [media.title, media.title_english, media.title_romaji, media.title_native]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLocaleLowerCase());
  const aliases = media.titles.map((value) => value.toLocaleLowerCase());
  const rank = (values: string[], exact: number, prefix: number, includes: number) => {
    if (values.some((value) => value === needle)) return exact;
    if (values.some((value) => value.startsWith(needle))) return prefix;
    if (values.some((value) => value.includes(needle))) return includes;
    return 0;
  };
  return Math.max(rank(primary, 4, 3, 2), rank(aliases, 2, 1, 1));
}

/** Relevance first, then popularity. Shared by all three suggestion lists. */
export function rankSuggestions(media: AniMedia[], query: string): AniMedia[] {
  return [...media].sort((left, right) => {
    const relevance = titleMatchRank(right, query) - titleMatchRank(left, query);
    if (relevance !== 0) return relevance;
    return (right.popularity ?? 0) - (left.popularity ?? 0);
  });
}
