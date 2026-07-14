import type { Anime, LanguageTag, SettingsScraper } from "@/types";
import { detectLanguages, qualityMatch, parseSize } from "./index.utils";

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

export function filterAnimeResults(
  data: Anime[] | undefined,
  settings: SettingsScraper,
): Anime[] | undefined {
  return data?.filter((res) => {
    if (settings.quality !== "all") {
      if (!qualityMatch(res.title, settings.quality)) return false;
    }
    if (settings.language !== "all") {
      const language: LanguageTag[] = detectLanguages(res.title);
      if (!language.some((l) => l.code === settings.language)) return false;
    }
    return true;
  });
}

export function sortAnimeResults(
  data: Anime[] | undefined,
  sortKey: SettingsScraper["sort"],
): Anime[] | undefined {
  if (!data) return undefined;
  return [...data].sort((a, b) => {
    switch (sortKey) {
      case "seeders":
        return b.seeders - a.seeders;
      case "leechers":
        return b.leechers - a.leechers;
      case "size":
        return parseSize(b.size) - parseSize(a.size);
      default:
        return 0;
    }
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
