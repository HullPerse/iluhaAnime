import { normalizeSearchText } from "@/lib/normalize.utils";
import type { AnimeTitle, AnimeTitleKind, SearchAnimeSuggestion } from "@/types/search";

export const TITLE_KIND_BONUS: Record<AnimeTitleKind, number> = {
  official: 60,
  romaji: 40,
  native: 40,
  abbreviation: 20,
  alias: 0,
  obsolete: -40,
};

export function titleKindBonus(kind: AnimeTitleKind): number {
  return TITLE_KIND_BONUS[kind] ?? 0;
}

interface TypedTitleInput {
  title: string;
  titles: string[];
  title_romaji?: string | null;
  title_english?: string | null;
  title_native?: string | null;
}

function kindOf(
  candidate: string,
  main: string,
  input: TypedTitleInput,
  seen: Set<string>
): AnimeTitleKind {
  if (seen.has(candidate)) return "alias";
  seen.add(candidate);
  if (candidate === main) return "official";
  if (input.title_english && candidate === input.title_english.trim()) return "official";
  if (input.title_romaji && candidate === input.title_romaji.trim()) return "romaji";
  if (input.title_native && candidate === input.title_native.trim()) return "native";
  return "alias";
}

function languageOf(candidate: string, input: TypedTitleInput): string | null {
  if (input.title_english && candidate === input.title_english.trim()) return "en";
  if (input.title_romaji && candidate === input.title_romaji.trim()) return "ro";
  if (input.title_native && candidate === input.title_native.trim()) return "ja";
  return null;
}

export function buildTypedTitles(animeId: number, input: TypedTitleInput): AnimeTitle[] {
  const main = input.title.trim();
  const seen = new Set<string>();
  const out: AnimeTitle[] = [];
  const push = (title: string, source: string | null): void => {
    const value = title.trim();
    if (!value || normalizeSearchText(value).length === 0) return;
    if (out.some((entry) => entry.title === value)) return;
    out.push({
      animeId,
      kind: kindOf(value, main, input, seen),
      language: languageOf(value, input),
      source,
      title: value,
    });
  };
  if (main) push(main, "anilist");
  if (input.title_english) push(input.title_english, "anilist");
  if (input.title_romaji) push(input.title_romaji, "anilist");
  if (input.title_native) push(input.title_native, "anilist");
  for (const alias of input.titles) push(alias, "anilist");
  return out;
}

export function typedTitlesOf(anime: SearchAnimeSuggestion): AnimeTitle[] {
  if (anime.typedTitles && anime.typedTitles.length > 0) return anime.typedTitles;
  return buildTypedTitles(anime.id, { title: anime.title, titles: anime.aliases });
}
