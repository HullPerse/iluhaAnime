import type { Anime, SearchFilters, SortDirection, SortKey } from "@/types";
import { parseSize, qualityMatch, detectLanguages } from "./index.utils";

export function getVisibleSources(
  visibleSources: string[],
  sourceInfos: { value: string; label: string; nsfw?: boolean }[],
): { value: string; label: string }[] {
  return sourceInfos
    .filter((s) => visibleSources.includes(s.value))
    .map((s) => ({
      value: s.value,
      label: s.nsfw ? `${s.label} (NSFW)` : s.label,
    }));
}

export function sortAnimeResults(
  data: Anime[] | undefined,
  sortKey: SortKey,
  direction: SortDirection,
): Anime[] | undefined {
  if (!data) return undefined;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...data].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "seeders":
        cmp = a.seeders - b.seeders;
        break;
      case "leechers":
        cmp = a.leechers - b.leechers;
        break;
      case "size":
        cmp = parseSize(a.size) - parseSize(b.size);
        break;
      default:
        return 0;
    }
    return cmp * multiplier;
  });
}

export function filterAnimeResults(
  data: Anime[] | undefined,
  filters: SearchFilters,
): Anime[] | undefined {
  if (!data) return undefined;
  return data.filter((item) => {
    if (filters.minSeeders > 0 && item.seeders < filters.minSeeders) return false;
    if (filters.hasMagnet && !item.magnet) return false;
    if (filters.quality !== "all" && !qualityMatch(item.title, filters.quality)) return false;
    if (filters.language !== "all") {
      const langs = detectLanguages(item.title).map((l) => l.code);
      if (!langs.includes(filters.language)) return false;
    }
    if (filters.sizeMin > 0 || filters.sizeMax > 0) {
      const bytes = parseSize(item.size);
      const minBytes = filters.sizeMin * 1048576;
      const maxBytes = filters.sizeMax > 0 ? filters.sizeMax * 1048576 : Infinity;
      if (bytes < minBytes || bytes > maxBytes) return false;
    }
    if (filters.codec !== "all") {
      const lower = item.title.toLowerCase();
      const codecLower = filters.codec.toLowerCase();
      if (!lower.includes(codecLower)) return false;
    }
    return true;
  });
}

export function getLanguageColors(): Record<string, string> {
  return {
    ru: "bg-secondary text-white",
    en: "bg-secondary text-white",
    multi: "bg-multi text-white",
    dual: "bg-dual text-white",
  };
}
