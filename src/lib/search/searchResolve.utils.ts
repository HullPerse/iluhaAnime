import type { CorrectionReason, SearchAnimeSuggestion, SpellWordSpan } from "@/types/search/search";

import { normalizeSearchText } from "@/lib/core/normalize.utils";
import { isRomanNumeral } from "@/lib/core/roman.utils";
import { damerauLevenshtein, isKnownGlueWord } from "@/lib/core/symspell.utils";
import {
  matchNormalizedTitle,
  spellKnownWords,
  spellTitles,
  suggestSpellings,
} from "@/lib/core/suggestions.utils";
import { flipLayout } from "@/lib/graphics/layout.utils";
import { stripReleaseNoise } from "@/lib/search/release.utils";
import { resolveTitleQuery } from "@/lib/search/searchHypothesis.utils";
import { parseTitleAttributes } from "@/lib/search/searchMarkers.utils";
import { titleKindBonus, typedTitlesOf } from "@/lib/search/searchTitle.utils";
import { findInvalidTorrentTag } from "@/lib/torrent/torrentTags.utils";
import type { SpellingWithReason } from "@/types/search/searchResolve";

export const PHRASE_CONFIDENCE = 60;
const LAYOUT_PENALTY = 60;
const EXACT_TITLE_SCORE = 900;

function popularityBoost(anime: SearchAnimeSuggestion): number {
  const favourite = anime.favourite ? 20 : 0;
  const score = anime.score && anime.score > 0 ? Math.min(20, anime.score / 5) : 0;
  return Math.min(40, favourite + score);
}

export function foldTransliterationVariants(word: string): string {
  return word
    .replaceAll("ou", "o")
    .replaceAll("oo", "o")
    .replaceAll("uu", "u")
    .replaceAll("ei", "e")
    .replaceAll("shi", "si")
    .replaceAll("chi", "ti")
    .replaceAll("tsu", "tu")
    .replaceAll("fu", "hu")
    .replaceAll("ji", "zi")
    .replaceAll("wo", "o")
    .replaceAll(/(.)\1/g, "$1");
}

function classifyWordFix(query: string, correction: string): CorrectionReason {
  const left = query.trim().split(/\s+/);
  const right = correction.trim().split(/\s+/);
  const count = Math.min(left.length, right.length);
  for (let index = 0; index < count; index++) {
    const a = normalizeSearchText(left[index] ?? "");
    const b = normalizeSearchText(right[index] ?? "");
    if (a && b && a !== b) {
      return foldTransliterationVariants(a) === foldTransliterationVariants(b)
        ? "transliteration"
        : "typo";
    }
  }
  return "typo";
}

const aliasLookupCache = new WeakMap<SearchAnimeSuggestion[], Map<string, string>>();

function aliasLookup(animeIndex: SearchAnimeSuggestion[]): Map<string, string> {
  const cached = aliasLookupCache.get(animeIndex);
  if (cached) return cached;
  const map = new Map<string, string>();
  for (const anime of animeIndex) {
    for (const entry of typedTitlesOf(anime)) {
      if (entry.kind !== "alias" && entry.kind !== "abbreviation") continue;
      const normalized = normalizeSearchText(entry.title);
      if (normalized && !map.has(normalized)) map.set(normalized, anime.title);
      for (const word of normalized.split(" ")) {
        if (word && !map.has(word)) map.set(word, anime.title);
      }
    }
  }
  aliasLookupCache.set(animeIndex, map);
  return map;
}

interface SpellingOptions {
  history?: string[];
  animeIndex?: SearchAnimeSuggestion[];
  extraValues?: Array<{ value: string }>;
  symSpell?: boolean;
}

function aliasCorrection(
  normalizedQuery: string,
  index: SearchAnimeSuggestion[] | undefined
): SpellingWithReason | null {
  if (!index || index.length === 0) return null;
  const official = aliasLookup(index).get(normalizedQuery);
  if (!official) return null;
  return { correction: official, evidence: {}, reason: "alias" };
}

function markerCorrection(
  query: string,
  options: SpellingOptions,
  index: SearchAnimeSuggestion[] | undefined
): SpellingWithReason | null {
  const parsed = parseTitleAttributes(query.trim());
  const hasMarker = parsed.season !== null || parsed.episode !== null;
  if (!parsed.explicit || !hasMarker || !parsed.remainder) return null;
  const sub = suggestSpellingWithReason(parsed.remainder, options);
  if (sub && (sub.reason === "typo" || sub.reason === "transliteration")) {
    const suffix = parsed.markers.join(" ");
    return {
      correction: suffix ? `${sub.correction} ${suffix}` : sub.correction,
      evidence: sub.evidence,
      reason: sub.reason,
      titleId: sub.titleId,
      confidence: sub.confidence,
    };
  }
  const [top] = resolveTitleQuery(parsed.remainder, { animeIndex: index, limit: 1 });
  if (index && index.length > 0 && !top) return null;
  return {
    correction: top?.title ?? parsed.remainder,
    evidence:
      parsed.season !== null ? { season: parsed.season } : { episode: parsed.episode ?? undefined },
    reason: "wrong_season",
  };
}

const LAYOUT_EXACT_FLOOR = 500;

interface FlatTitle {
  normalized: string;
  display: string;
  words: string[];
  animeId: number;
  bonus: number;
  popularity: number;
}

const flatTitleCache = new WeakMap<SearchAnimeSuggestion[], FlatTitle[]>();
const exactTitleCache = new WeakMap<SearchAnimeSuggestion[], Set<string>>();

function flatTitlesOf(index: SearchAnimeSuggestion[]): FlatTitle[] {
  const cached = flatTitleCache.get(index);
  if (cached) return cached;
  const flat: FlatTitle[] = [];
  for (const anime of index) {
    const popularity = popularityBoost(anime);
    for (const entry of typedTitlesOf(anime)) {
      const normalized = normalizeSearchText(entry.title);
      if (!normalized) continue;
      flat.push({
        normalized,
        display: entry.title,
        words: normalized.split(" "),
        animeId: anime.id,
        bonus: titleKindBonus(entry.kind),
        popularity,
      });
    }
  }
  flatTitleCache.set(index, flat);
  return flat;
}

function exactTitleSetOf(index: SearchAnimeSuggestion[]): Set<string> {
  const cached = exactTitleCache.get(index);
  if (cached) return cached;
  const set = new Set<string>();
  for (const anime of index) {
    for (const entry of typedTitlesOf(anime)) {
      if (entry.kind !== "official" && entry.kind !== "romaji" && entry.kind !== "native") {
        continue;
      }
      const normalized = normalizeSearchText(entry.title);
      if (normalized) set.add(normalized);
    }
  }
  exactTitleCache.set(index, set);
  return set;
}

interface ScoredCorrection {
  text: string;
  normalized: string;
  score: number;
  animeId: number | null;
}

function scoreAgainstTitles(
  text: string,
  full: string,
  normalized: string,
  words: string[],
  index: SearchAnimeSuggestion[],
  penalty: number
): ScoredCorrection | null {
  let best: ScoredCorrection | null = null;
  for (const title of flatTitlesOf(index)) {
    const match = matchNormalizedTitle(null, normalized, title.normalized, words, title.words);
    if (match == null) continue;
    const score = match + title.bonus + title.popularity - penalty;
    if (!best || score > best.score) {
      best = {
        text: match === 1000 && full === normalized ? title.display : text,
        normalized: full,
        score,
        animeId: title.animeId,
      };
    }
  }
  return best;
}

function scoreAgainstStrings(
  text: string,
  full: string,
  options: SpellingOptions,
  penalty: number
): ScoredCorrection | null {
  let best: ScoredCorrection | null = null;
  const strings = [
    ...(options.history ?? []),
    ...(options.extraValues?.map((entry) => entry.value) ?? []),
  ];
  for (const entry of strings) {
    const target = normalizeSearchText(entry);
    if (!target) continue;
    const match = matchNormalizedTitle(null, full, target, full.split(" "));
    if (match == null) continue;
    const score = match - penalty;
    if (!best || score > best.score) best = { text, normalized: full, score, animeId: null };
  }
  return best;
}

function coverageFallback(
  text: string,
  full: string,
  known: Set<string>,
  penalty: number
): ScoredCorrection | null {
  const covered = full
    .split(" ")
    .every((word) => !word || known.has(word) || isKnownGlueWord(word) || isRomanNumeral(word));
  if (!covered) return null;
  return { text, normalized: full, score: 400 - penalty, animeId: null };
}

function scoreCorrectionText(
  text: string,
  options: SpellingOptions,
  known: Set<string>,
  penalty: number
): ScoredCorrection | null {
  const full = normalizeSearchText(text);
  if (!full) return null;
  const index = options.animeIndex ?? [];
  const fromTitles =
    index.length > 0 ? scoreAgainstTitles(text, full, full, full.split(" "), index, penalty) : null;
  const fromStrings = scoreAgainstStrings(text, full, options, penalty);
  if (fromTitles && fromStrings) {
    return fromTitles.score >= fromStrings.score ? fromTitles : fromStrings;
  }
  return fromTitles ?? fromStrings ?? coverageFallback(text, full, known, penalty);
}

function rankCorrections(
  texts: string[],
  options: SpellingOptions,
  known: Set<string>,
  penalty = 0
): ScoredCorrection[] {
  const seen = new Set<string>();
  const out: ScoredCorrection[] = [];
  for (const text of texts) {
    const key = normalizeSearchText(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const scored = scoreCorrectionText(text, options, known, penalty);
    if (scored) out.push(scored);
  }
  return out.sort((left, right) => right.score - left.score);
}

function rawWordSpans(value: string): Array<{ word: string; start: number; end: number }> {
  const spans: Array<{ word: string; start: number; end: number }> = [];
  const wordRe = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRe.exec(value)) !== null) {
    spans.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function alignSpans(query: string, correction: string): SpellWordSpan[] {
  const queryParts = rawWordSpans(query);
  const used = new Set<number>();
  const spans: SpellWordSpan[] = [];
  let cursor = 0;
  for (const corrected of correction.trim().split(/\s+/)) {
    const target = normalizeSearchText(corrected);
    if (!target) continue;
    let bestIndex = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let index = cursor; index < queryParts.length; index++) {
      if (used.has(index)) continue;
      const source = normalizeSearchText(queryParts[index]?.word ?? "");
      if (!source) continue;
      const dist = source === target ? 0 : damerauLevenshtein(source, target);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = index;
      }
      if (dist === 0) break;
    }
    if (bestIndex === -1 || bestDist > 2) continue;
    used.add(bestIndex);
    cursor = bestIndex + 1;
    const part = queryParts[bestIndex];
    if (!part || bestDist === 0) continue;
    spans.push({
      start: part.start,
      end: part.end,
      severity: bestDist <= 1 ? "warn" : "error",
      word: part.word,
      corrected,
    });
  }
  return spans;
}

function phraseSpans(query: string, correction: string, distance: number): SpellWordSpan[] {
  const leading = query.length - query.trimStart().length;
  const trimmed = query.trim();
  return [
    {
      start: leading,
      end: leading + trimmed.length,
      severity: distance <= 2 ? "warn" : "error",
      word: trimmed,
      corrected: correction,
    },
  ];
}

interface PickedCorrection {
  picked: ScoredCorrection;
  source: ScoredCorrection[];
  layout: boolean;
  flipped: string;
}

const LAYOUT_SKIP_ABOVE = 1000 - LAYOUT_PENALTY;

function layoutContender(
  work: string,
  options: SpellingOptions,
  phraseOptions: SpellingOptions,
  known: Set<string>,
  direct: ScoredCorrection | null
): PickedCorrection | null {
  if (direct && direct.score >= LAYOUT_SKIP_ABOVE) return null;
  const flipped = flipLayout(work);
  if (flipped === work || normalizeSearchText(flipped).length < 3) return null;
  const flippedRanked = rankCorrections(
    suggestSpellings(flipped, options, 2),
    phraseOptions,
    known,
    LAYOUT_PENALTY
  );
  const flippedTop = flippedRanked[0] ?? null;
  if (flippedTop && (!direct || flippedTop.score > direct.score)) {
    return { picked: flippedTop, source: flippedRanked, layout: true, flipped };
  }
  if (flippedTop) return null;
  const exact = scoreCorrectionText(flipped, phraseOptions, known, LAYOUT_PENALTY);
  if (!exact || exact.score < LAYOUT_EXACT_FLOOR || (direct && exact.score <= direct.score)) {
    return null;
  }
  return { picked: exact, source: [exact], layout: true, flipped };
}

function pickCorrection(
  work: string,
  options: SpellingOptions,
  phraseOptions: SpellingOptions
): PickedCorrection | null {
  const known = spellKnownWords(phraseOptions);
  const ranked = rankCorrections(suggestSpellings(work, options, 3), phraseOptions, known);
  const direct = ranked[0] ?? null;
  return (
    layoutContender(work, options, phraseOptions, known, direct) ??
    (direct ? { picked: direct, source: ranked, layout: false, flipped: work } : null)
  );
}

function spellingCorrection(
  query: string,
  work: string,
  options: SpellingOptions
): SpellingWithReason | null {
  const phraseOptions: SpellingOptions = {
    history: options.history,
    animeIndex: options.animeIndex,
    extraValues: options.extraValues,
  };
  const selection = pickCorrection(work, options, phraseOptions);
  if (!selection) return null;
  const { picked, source, layout, flipped } = selection;
  const reason = classifyWordFix(layout ? flipped : work, picked.text);
  const margin =
    source.length > 1
      ? picked.score - (source[1]?.score ?? 0)
      : picked.score >= EXACT_TITLE_SCORE
        ? 120
        : 0;
  const queryDistance = damerauLevenshtein(normalizeSearchText(work), picked.normalized);
  const phrase = picked.animeId != null && margin >= PHRASE_CONFIDENCE;
  return {
    correction: picked.text,
    evidence: layout ? { layout: true } : {},
    reason,
    spans: phrase ? phraseSpans(query, picked.text, queryDistance) : alignSpans(query, picked.text),
    titleId: picked.animeId ?? undefined,
    confidence: margin,
  };
}

function partialCorrection(
  normalizedQuery: string,
  options: SpellingOptions,
  index: SearchAnimeSuggestion[] | undefined
): SpellingWithReason | null {
  const pools = index && index.length > 0 ? spellTitles(options).titles : (options.history ?? []);
  for (const title of pools) {
    const normalized = normalizeSearchText(title);
    if (normalized.length > normalizedQuery.length && normalized.startsWith(normalizedQuery)) {
      return { correction: title, evidence: { prefix: true }, reason: "partial" };
    }
  }
  return null;
}

function formatCorrection(query: string): SpellingWithReason | null {
  const invalid = findInvalidTorrentTag(query);
  if (!invalid) return null;
  const correction = query.replace(invalid.raw, " ").replace(/\s+/g, " ").trim();
  if (!correction) return null;
  return { correction, evidence: { tag: invalid.key }, reason: "wrong_format" };
}

export function suggestSpellingWithReason(
  query: string,
  options: SpellingOptions = {}
): SpellingWithReason | null {
  const normalizedQuery = normalizeSearchText(query);
  if (options.symSpell === false) return null;
  if (normalizedQuery.length < 3) return null;
  const core = stripReleaseNoise(query);
  const work = normalizeSearchText(core).length >= 3 ? core : query;
  const index = options.animeIndex;
  const alias = aliasCorrection(normalizeSearchText(work), index);
  if (alias) return alias;
  const phraseFix = spellingCorrection(query, work, options);
  const phraseTitle =
    phraseFix?.titleId != null &&
    (phraseFix.confidence ?? 0) >= PHRASE_CONFIDENCE &&
    index &&
    exactTitleSetOf(index).has(normalizeSearchText(phraseFix.correction))
      ? phraseFix
      : null;
  if (phraseTitle) return phraseTitle;
  if (index && exactTitleSetOf(index).has(normalizeSearchText(work))) return null;
  return (
    markerCorrection(work, options, index) ??
    phraseFix ??
    partialCorrection(normalizeSearchText(work), options, index) ??
    formatCorrection(query)
  );
}
