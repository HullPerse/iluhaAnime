import type {
  CorrectionEvidence,
  CorrectionReason,
  SearchAnimeSuggestion,
  SpellWordSpan,
} from "@/types/search";

import { flipLayout } from "./layout.utils";
import { normalizeSearchText } from "./normalize.utils";
import { stripReleaseNoise } from "./release.utils";
import { isRomanNumeral } from "./roman.utils";
import {
  matchNormalizedTitle,
  spellKnownWords,
  spellTitles,
  suggestSpellings,
} from "./suggestions.utils";
import { damerauLevenshtein, isKnownGlueWord } from "./symspell.utils";
import { titleKindBonus, typedTitlesOf } from "./title.utils";
import { findInvalidTorrentTag } from "./torrentTags.utils";

export interface ParsedTitleAttributes {
  season: number | null;
  episode: number | null;
  year: number | null;
  remainder: string;
  markers: string[];
  explicit: boolean;
}

export interface TitleHypothesis {
  animeId: number | null;
  title: string;
  season: number | null;
  episode: number | null;
  year: number | null;
  remainder: string;
  score: number;
}

const MAX_SEASON = 50;
const MAX_EPISODE_AMBIGUOUS = 1500;

const YEAR_RE = /(^|\s)\(?((?:19|20)\d{2})\)?(?=\s|$)/;
const SEASON_RE =
  /(^|\s)(?:s(\d{1,2})|season\s*(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+season)(?=\s|$)/i;
const EPISODE_RE = /(^|\s)(?:e(\d{1,4})|ep(?:isode)?\s*(\d{1,4})|第(\d{1,4})話)(?=\s|$)/i;
const TRAILING_NUMBER_RE = /\s(\d{1,4})$/;

function firstGroup(match: RegExpMatchArray | null): number | null {
  if (!match) return null;
  for (let index = 2; index < match.length; index++) {
    const raw = match[index];
    if (raw !== undefined && raw !== "") {
      const value = Number(raw);
      if (Number.isInteger(value)) return value;
    }
  }
  return null;
}

function stripFirst(
  query: string,
  pattern: RegExp
): { rest: string; removed: string; match: RegExpMatchArray } | null {
  const match = query.match(pattern);
  if (!match || match.index === undefined) return null;
  const prefix = match[1] ?? "";
  const start = match.index + prefix.length;
  const end = match.index + match[0].length;
  const removed = query.slice(start, end);
  const rest = `${query.slice(0, start)} ${query.slice(end)}`.replace(/\s+/g, " ").trim();
  return { match, removed, rest };
}

// A bare 4-digit number after a filter key and operator (year >= 2020)
// belongs to parseIntent, not to the title resolver.
function isFilterValue(query: string, match: RegExpMatchArray | null): boolean {
  if (!match || match.index === undefined) return false;
  const before = query.slice(0, match.index).trimEnd();
  return /(?:year|date)\s*(?:~=|>=|<=|!=|=|>|<)\s*$/i.test(before);
}

export function romanToInt(value: string): number | null {
  const word = value.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(word)) return null;
  const table: Record<string, number> = { C: 100, D: 500, I: 1, L: 50, M: 1000, V: 5, X: 10 };
  let total = 0;
  let previous = 0;
  for (let index = word.length - 1; index >= 0; index--) {
    const current = table[word[index] ?? ""] ?? 0;
    total = current < previous ? total - current : total + current;
    previous = current;
  }
  return total > 0 ? total : null;
}

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

export function parseTitleAttributes(query: string): ParsedTitleAttributes {
  const empty: ParsedTitleAttributes = {
    episode: null,
    explicit: false,
    markers: [],
    remainder: query.trim(),
    season: null,
    year: null,
  };
  const trimmed = query.trim();
  if (!trimmed) return empty;
  let rest = trimmed;
  let explicit = false;
  let year: number | null = null;
  const markers: string[] = [];

  const yearFound = stripFirst(rest, YEAR_RE);
  const yearCandidate = yearFound ? firstGroup(yearFound.match) : null;
  if (yearFound && yearCandidate !== null && !isFilterValue(rest, yearFound.match)) {
    year = yearCandidate;
    markers.push(yearFound.removed);
    rest = yearFound.rest;
    explicit = true;
  }

  const seasonFound = stripFirst(rest, SEASON_RE);
  const seasonCandidate = seasonFound ? firstGroup(seasonFound.match) : null;
  const season =
    seasonCandidate !== null && seasonCandidate >= 1 && seasonCandidate <= MAX_SEASON
      ? seasonCandidate
      : null;
  if (seasonFound && season !== null) {
    markers.push(seasonFound.removed);
    rest = seasonFound.rest;
    explicit = true;
  }

  const episodeFound = stripFirst(rest, EPISODE_RE);
  const episodeCandidate = episodeFound ? firstGroup(episodeFound.match) : null;
  const episode = episodeCandidate !== null && episodeCandidate >= 0 ? episodeCandidate : null;
  if (episodeFound && episode !== null) {
    markers.push(episodeFound.removed);
    rest = episodeFound.rest;
    explicit = true;
  }

  return { episode, explicit, markers, remainder: rest.trim(), season, year };
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

export interface SpellingWithReason {
  correction: string;
  reason: CorrectionReason;
  evidence: CorrectionEvidence;
  /** Word or phrase spans in absolute query coordinates, when computable. */
  spans?: SpellWordSpan[];
  /** Anime id when the correction equals a known title. */
  titleId?: number;
  /** Best minus second-best phrase score. Phrase spans need >= 60. */
  confidence?: number;
}

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
    // The remainder fix keeps its title link, but its spans point at the
    // remainder: drop them so callers fall back to a full-query diff.
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

/**
 * Normalized official/romaji/native titles. An exact hit means the query is
 * already correct: markers must not rewrite it and phrase fixes must be whole
 * titles, never marker-stripped remainders. Aliases stay out on purpose.
 */
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
      // Exact title hits surface the stored display text instead of the
      // lowercase symspell form, so did-you-mean shows "Sousou no Frieren".
      // Marker queries keep the full text so "Academia S8" never loses "S8".
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
  // No full-phrase hit (multi-word query against single-word history):
  // accept the candidate when every word is known vocabulary, so word-level
  // fixes like "friren attak" still surface without a title index.
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
  // Score the full text including any season markers: they may be part of
  // the title itself ("... 2nd Season"), and short markers still match real
  // titles through the scorer's own tolerance. Stripping them first would
  // hand the sibling season's id to a correct text.
  const index = options.animeIndex ?? [];
  const fromTitles =
    index.length > 0
      ? scoreAgainstTitles(text, full, full, full.split(" "), index, penalty)
      : null;
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

/**
 * Aligns correction words to query words in order, so inserted words (a split
 * that adds "no") and dropped noise (release tags) produce no span. Offsets
 * are absolute in the original query.
 */
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

// A direct hit this good cannot lose to a penalized layout guess
// (layout exact tops out at 1000 - penalty), so skip the second pipeline.
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
  // A confident phrase hit beats the marker path, but only when the fix is a
  // whole known title: titles like "3-gatsu no Lion 2nd Season" contain season
  // words, and stripping the marker first would attach the wrong sibling's id
  // to a correct text. Marker-stripped remainders ("Frieren" from "s5")
  // always fall through so the marker survives.
  const phraseFix = spellingCorrection(query, work, options);
  const phraseTitle =
    phraseFix?.titleId != null &&
    (phraseFix.confidence ?? 0) >= PHRASE_CONFIDENCE &&
    index &&
    exactTitleSetOf(index).has(normalizeSearchText(phraseFix.correction))
      ? phraseFix
      : null;
  if (phraseTitle) return phraseTitle;
  // An exact title needs no fix at all: without this guard the marker path
  // rewrites season-titled queries and partial path hijacks exact romaji.
  if (index && exactTitleSetOf(index).has(normalizeSearchText(work))) return null;
  return (
    markerCorrection(work, options, index) ??
    phraseFix ??
    partialCorrection(normalizeSearchText(work), options, index) ??
    formatCorrection(query)
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
    const normalized = normalizeSearchText(interp.remainder);
    if (!normalized) continue;
    const words = normalized.split(" ");
    let bestAnime: SearchAnimeSuggestion | null = null;
    let bestScore = -Infinity;
    for (const anime of index) {
      const scored = scoreRemainder(normalized, words, anime);
      if (scored != null && scored > bestScore) {
        bestScore = scored;
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
