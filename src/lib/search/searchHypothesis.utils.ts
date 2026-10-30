import { normalizeSearchText } from "@/lib/core/normalize.utils";
import { matchNormalizedTitle } from "@/lib/core/suggestions.utils";
import {
  MAX_EPISODE_AMBIGUOUS,
  MAX_SEASON,
  parseTitleAttributes,
  romanToInt,
} from "@/lib/search/searchMarkers.utils";
import { titleKindBonus, typedTitlesOf } from "@/lib/search/searchTitle.utils";
import type { SearchAnimeSuggestion } from "@/types/search/search";
import type { ParsedTitleAttributes, TitleHypothesis } from "@/types/search/searchResolve";

const TRAILING_NUMBER_RE = /\s(\d{1,4})$/;

function trailingRomanSeason(query: string): number | null {
  const tokens = query.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const last = tokens.at(-1) ?? "";
  if (!/^[ivxlcdm]+$/i.test(last)) return null;
  const value = romanToInt(last);
  if (value === null || value < 1 || value > MAX_SEASON) return null;
  return value;
}

function stripTrailingToken(query: string): string {
  return query.replace(/\s+\S+$/, "").trim();
}

interface Interpretation {
  season: number | null;
  episode: number | null;
  year: number | null;
  remainder: string;
  prior: number;
}

function buildInterpretations(query: string, parsed: ParsedTitleAttributes): Interpretation[] {
  const base = {
    episode: parsed.episode,
    season: parsed.season,
    year: parsed.year,
  };
  if (parsed.explicit && parsed.remainder) {
    return [{ ...base, prior: 0.9, remainder: parsed.remainder }];
  }
  if (parsed.explicit) return [{ ...base, prior: 0.9, remainder: query.trim() }];
  const trailing = parsed.remainder.match(TRAILING_NUMBER_RE);
  const bare = trailing?.[1] === undefined ? null : Number(trailing[1]);
  if (bare !== null && Number.isInteger(bare) && bare <= MAX_EPISODE_AMBIGUOUS) {
    const stripped = parsed.remainder.replace(TRAILING_NUMBER_RE, "").trim();
    if (stripped) {
      return [
        { ...base, episode: bare, prior: 0.6, remainder: stripped },
        { ...base, prior: 0.5, remainder: parsed.remainder },
      ];
    }
  }
  const roman = trailingRomanSeason(parsed.remainder);
  if (roman !== null) {
    const stripped = stripTrailingToken(parsed.remainder);
    if (stripped) {
      return [
        { ...base, prior: 0.55, remainder: stripped, season: roman },
        { ...base, prior: 0.5, remainder: parsed.remainder },
      ];
    }
  }
  return [{ ...base, prior: 0.4, remainder: parsed.remainder }];
}

function scoreRemainder(
  normalizedRemainder: string,
  words: string[],
  anime: SearchAnimeSuggestion
): number | null {
  const typed = typedTitlesOf(anime);
  const normalizedTitles =
    anime.typedTitles && anime.typedTitles.length > 0
      ? typed.map((entry) => normalizeSearchText(entry.title))
      : [anime.title, ...anime.aliases].map(normalizeSearchText);
  let best: number | null = null;
  for (let index = 0; index < normalizedTitles.length; index++) {
    const title = normalizedTitles[index] ?? "";
    const match = matchNormalizedTitle(null, normalizedRemainder, title, words);
    if (match != null) {
      const scored = match + titleKindBonus(typed[index]?.kind ?? "alias");
      if (best === null || scored > best) best = scored;
    }
  }
  return best;
}

function titleSeasonNumber(normalizedTitle: string): number | null {
  const tokens = normalizedTitle.split(" ");
  const last = tokens.at(-1) ?? "";
  if (/^\d{1,2}$/.test(last)) {
    const value = Number(last);
    return value >= 1 && value <= 50 ? value : null;
  }
  const ordinal = last.match(/^(\d{1,2})(?:st|nd|rd|th)$/);
  if (ordinal?.[1] && tokens.at(-2) === "season") {
    const value = Number(ordinal[1]);
    return value >= 1 && value <= 50 ? value : null;
  }
  return null;
}

function animeMatchesSeasonNumber(anime: SearchAnimeSuggestion, season: number): boolean {
  return typedTitlesOf(anime).some(
    (entry) => titleSeasonNumber(normalizeSearchText(entry.title)) === season
  );
}

export function resolveTitleQuery(
  query: string,
  options: { animeIndex?: SearchAnimeSuggestion[]; limit?: number } = {}
): TitleHypothesis[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const limit = Math.max(1, options.limit ?? 3);
  const parsed = parseTitleAttributes(trimmed);
  const interpretations = buildInterpretations(trimmed, parsed);
  const index = options.animeIndex;
  if (!index || index.length === 0) {
    return interpretations.map((interp) => ({
      animeId: null,
      episode: interp.episode,
      remainder: interp.remainder,
      score: interp.prior,
      season: interp.season,
      title: interp.remainder,
      year: interp.year,
    }));
  }
  const out: TitleHypothesis[] = [];
  for (const interp of interpretations) {
    const remainder = interp.remainder
      .replace(/\bgekijouban\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const normalized = normalizeSearchText(remainder);
    if (!normalized) continue;
    const words = normalized.split(" ");
    let bestAnime: SearchAnimeSuggestion | null = null;
    let bestScore = -Infinity;
    for (const anime of index) {
      const scored = scoreRemainder(normalized, words, anime);
      if (scored != null && scored > bestScore) {
        bestScore = scored;
        bestAnime = anime;
        continue;
      }
      if (
        scored != null &&
        scored === bestScore &&
        bestAnime &&
        interp.season != null &&
        animeMatchesSeasonNumber(anime, interp.season) &&
        !animeMatchesSeasonNumber(bestAnime, interp.season)
      ) {
        bestAnime = anime;
      }
    }
    if (bestAnime) {
      out.push({
        animeId: bestAnime.id,
        episode: interp.episode,
        remainder: interp.remainder,
        score: bestScore + interp.prior * 10,
        season: interp.season,
        title: bestAnime.title,
        year: interp.year,
      });
    }
  }
  return out.sort((left, right) => right.score - left.score).slice(0, limit);
}
