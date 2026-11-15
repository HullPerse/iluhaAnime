import { normalizeSearchText } from "@hullperse/hp_utils/normalize";

import { matchingAlias } from "@/lib/daily/search.utils";
import type { AniMedia } from "@/types/anilist/anilist";
import type { DailySearchEntry } from "@/types/api/daily";
import type { DailyGuessSuggestion } from "@/types/ui/daily";

function titleScore(title: string, query: string): number {
  const normalized = normalizeSearchText(title);
  if (normalized === query) return 100;
  if (normalized.startsWith(query)) return 80;
  const words = normalized.split(" ");
  if (words.some((word) => word.startsWith(query))) return 65;
  if (normalized.includes(query)) return 50;
  const queryWords = query.split(" ").filter(Boolean);
  if (queryWords.length > 1 && queryWords.every((word) => normalized.includes(word))) return 40;
  return 0;
}

export function localGuessSuggestions(
  entries: readonly DailySearchEntry[],
  query: string,
  limit = 6
): DailyGuessSuggestion[] {
  const normalized = normalizeSearchText(query.trim());
  if (normalized.length < 2) return [];
  return entries
    .map((entry) => ({ entry, score: titleScore(entry.title, normalized) }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.entry.popularity - left.entry.popularity ||
        left.entry.title.localeCompare(right.entry.title)
    )
    .slice(0, limit)
    .map(({ entry }) => ({
      id: entry.mediaId,
      title: entry.title,
      titles: [entry.title],
      coverUrl: null,
      alias: null,
      year: entry.year,
      format: entry.format,
      popularity: entry.popularity,
    }));
}

export function suggestionFromMedia(media: AniMedia, query: string): DailyGuessSuggestion {
  const titles = [...new Set([media.title, ...media.titles].filter((title) => title.length > 0))];
  return {
    id: media.id,
    title: media.title,
    titles,
    coverUrl: media.cover_url,
    alias: matchingAlias(media, query),
    year: media.season_year,
    format: media.format,
    popularity: media.popularity ?? 0,
  };
}

export function mergeSuggestions(
  local: readonly DailyGuessSuggestion[],
  remote: readonly DailyGuessSuggestion[],
  limit = 6
): DailyGuessSuggestion[] {
  const seen = new Set<number>();
  const merged: DailyGuessSuggestion[] = [];
  for (const suggestion of [...local, ...remote]) {
    if (seen.has(suggestion.id)) continue;
    seen.add(suggestion.id);
    merged.push(suggestion);
    if (merged.length >= limit) break;
  }
  return merged;
}
