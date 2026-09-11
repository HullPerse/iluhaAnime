import { parse } from "anitomy";

import type { TranslationKey, TranslationVariables } from "@/lib/locale/i18n.utils";

const seasonPatterns = (season: string) => [
  new RegExp(`\\s+S${season.padStart(2, "0")}\\s*$`, "i"),
  new RegExp(`\\s+S${season}\\s*$`, "i"),
  new RegExp(`\\s+Season\\s+${season}\\s*$`, "i"),
  new RegExp(`\\s+${season}(?:st|nd|rd|th)\\s+Season\\s*$`, "i"),
];

function cleanTitle(title: string | undefined, season: string | undefined): string {
  if (!title) return "";
  let cleaned = title.trim();
  if (season) {
    for (const pattern of seasonPatterns(season)) {
      cleaned = cleaned.replace(pattern, "");
    }
  }
  return cleaned.trim() || title.trim();
}

export function formatParsedTitle(
  filename: string,
  t: (key: TranslationKey, variables?: TranslationVariables) => string
): string {
  const parsed = parse(filename);
  if (!parsed) return filename;

  const title = cleanTitle(parsed.title, parsed.season);
  const season = parsed.season ? t("player.title.season", { n: parsed.season }) : "";

  const epNum = parsed.episode?.number ?? parsed.episode?.numberAlt;
  const epTitle = parsed.episode?.title;
  const epNumAlt = parsed.episode?.numberAlt;

  let episodeStr = "";
  if (epNum !== undefined && epNum !== null) {
    const showRange = epNumAlt !== undefined && epNumAlt !== null && epNumAlt !== epNum;
    episodeStr = showRange
      ? t("player.title.episodes.range", { from: epNum, to: epNumAlt })
      : t("player.title.episode", { n: epNum });
    if (epTitle) episodeStr += `: ${epTitle}`;
  } else if (epTitle) {
    episodeStr = t("player.title.episode.colon", { title: epTitle });
  }

  return [title, season, episodeStr].filter((part) => part && part.trim()).join(", ");
}

export function fileNameFromPath(p: string): string {
  const parts = p.replaceAll(/\\/g, "/").split("/");
  return parts.at(-1) || p;
}
