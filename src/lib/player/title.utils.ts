import type { TranslationKey, TranslationVariables } from "@/lib/locale/i18n.utils";
import { clearMediaParseCache, parseMediaFile, parseMediaPath } from "@/lib/media/parse.utils";

export function clearParseCache(): void {
  clearMediaParseCache();
}

export function formatParsedTitle(
  input: string,
  t: (key: TranslationKey, variables?: TranslationVariables) => string,
  dir: string | null = null
): string {
  const parsed = dir === null ? parseMediaPath(input) : parseMediaFile(dir, input);

  const season = parsed.season ? t("player.title.season", { n: parsed.season }) : "";

  const epNum = parsed.episode.number ?? parsed.episode.numberAlt;
  const epTitle = parsed.episode.title;
  const epNumAlt = parsed.episode.numberAlt;

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

  return [parsed.title, season, episodeStr].filter((part) => part && part.trim()).join(", ");
}

export function fileNameFromPath(p: string): string {
  const slash = p.lastIndexOf("/");
  const backslash = p.lastIndexOf("\\");
  const cut = Math.max(slash, backslash);
  if (cut < 0) return p;
  const name = p.slice(cut + 1);
  return name || p;
}
