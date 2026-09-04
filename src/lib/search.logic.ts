import type { Anime, SearchFilters, SortDirection, SortKey } from "@/types";

import { parseSize, qualityMatch, detectLanguages } from "./index.utils";

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

export function sortAnimeResults(
  data: Anime[] | undefined,
  sortKey: SortKey,
  direction: SortDirection
): Anime[] | undefined {
  if (!data) return undefined;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...data].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "seeders": {
        cmp = a.seeders - b.seeders;
        break;
      }
      case "leechers": {
        cmp = a.leechers - b.leechers;
        break;
      }
      case "size": {
        cmp = parseSize(a.size) - parseSize(b.size);
        break;
      }
      default: {
        return 0;
      }
    }
    return cmp * multiplier;
  });
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
