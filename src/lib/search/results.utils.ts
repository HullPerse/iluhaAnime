import type { Anime, SearchFilters, SortDirection, SortKey } from "@/types";

import { parseSize, qualityMatch, detectLanguages } from "./format.utils";

export function getVisibleSources(
  visibleSources: string[],
  sourceInfos: { value: string; label: string; nsfw?: boolean }[]
): { value: string; label: string }[] {
  return sourceInfos
    .filter((s) => visibleSources.includes(s.value))
    .map((s) => ({
      label: s.nsfw ? `${s.label} [NSFW]` : s.label,
      value: s.value,
    }));
}

const SORT_COMPARATORS: Record<SortKey, (a: Anime, b: Anime) => number> = {
  seeders: (a, b) => a.seeders - b.seeders,
  leechers: (a, b) => a.leechers - b.leechers,
  size: (a, b) => parseSize(a.size) - parseSize(b.size),
};

export function sortAnimeResults(
  data: Anime[] | undefined,
  sortKey: SortKey,
  direction: SortDirection
): Anime[] | undefined {
  if (!data) return undefined;
  const multiplier = direction === "asc" ? 1 : -1;
  const compare = SORT_COMPARATORS[sortKey];
  return [...data].sort((a, b) => compare(a, b) * multiplier);
}

function passesSeeders(item: Anime, minSeeders: number): boolean {
  return !(minSeeders > 0 && item.seeders < minSeeders);
}

function passesMagnet(item: Anime, hasMagnet: boolean): boolean {
  return !(hasMagnet && !item.magnet);
}

function passesQuality(item: Anime, quality: string): boolean {
  return quality === "all" || qualityMatch(item.title, quality);
}

function passesLanguage(item: Anime, language: string): boolean {
  if (language === "all") return true;
  const langs = detectLanguages(item.title).map((l) => l.code);
  return langs.includes(language);
}

function passesSize(item: Anime, sizeMin: number, sizeMax: number): boolean {
  if (sizeMin <= 0 && sizeMax <= 0) return true;
  const bytes = parseSize(item.size);
  const minBytes = sizeMin * 1_048_576;
  const maxBytes = sizeMax > 0 ? sizeMax * 1_048_576 : Infinity;
  return bytes >= minBytes && bytes <= maxBytes;
}

function passesCodec(item: Anime, codec: string): boolean {
  if (codec === "all") return true;
  const lower = item.title.toLowerCase();
  return lower.includes(codec.toLowerCase());
}

export function filterAnimeResults(
  data: Anime[] | undefined,
  filters: SearchFilters
): Anime[] | undefined {
  if (!data) return undefined;
  return data.filter(
    (item) =>
      passesSeeders(item, filters.minSeeders) &&
      passesMagnet(item, filters.hasMagnet) &&
      passesQuality(item, filters.quality) &&
      passesLanguage(item, filters.language) &&
      passesSize(item, filters.sizeMin, filters.sizeMax) &&
      passesCodec(item, filters.codec)
  );
}

export function getLanguageColors(): Record<string, string> {
  return {
    dual: "bg-dual text-white",
    en: "bg-secondary text-white",
    multi: "bg-multi text-white",
    ru: "bg-secondary text-white",
  };
}
