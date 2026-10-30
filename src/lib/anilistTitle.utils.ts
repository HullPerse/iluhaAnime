import type { AniMedia, AniTitleLanguage } from "@/types/anilist";

export interface AnimeTitleFields {
  romaji: string;
  english?: string | null;
  native?: string | null;
}

export function resolveAnimeTitle(
  titles: AnimeTitleFields | null | undefined,
  pref: AniTitleLanguage | null | undefined
): string {
  if (!titles) return "";
  const order: AniTitleLanguage[] = [pref ?? "english", "english", "romaji", "native"];
  for (const language of order) {
    const value = titles[language]?.trim();
    if (value) return value;
  }
  return "";
}

export function animeTitleFields(
  media: Pick<AniMedia, "title" | "title_romaji" | "title_english" | "title_native">
): AnimeTitleFields {
  const romaji = media.title_romaji?.trim() ?? "";
  const english = media.title_english?.trim() ?? "";
  const native = media.title_native?.trim() ?? "";
  return {
    english,
    native,
    romaji: romaji || english || native || media.title.trim(),
  };
}
