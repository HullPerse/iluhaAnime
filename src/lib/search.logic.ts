import type { Anime, SettingsScraper } from "@/types";
import { parseSize } from "./index.utils";

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
