import type { ResolvedCover } from "@/store/cover.store";

export interface CoverParsed {
  title: string;
  searchTitle: string;
  season?: number;
  year?: number;
  kind?: string;
  arc?: string;
  altTitles?: string[];
}

export interface CoverProfile {
  userScore?: number | null;
  listStatus?: string | null;
  favourite?: boolean;
}

export interface CoverCandidate {
  id: number;
  romaji: string;
  english?: string | null;
  extraTitles?: string[];
  format?: string | null;
  seasonYear?: number | null;
  coverUrl?: string | null;
  userScore?: number | null;
  listStatus?: string | null;
  favourite?: boolean;
}

export interface LocalIndexEntry {
  id: number;
  title: string;
  aliases: string[];
}

export function withProfile(
  candidates: CoverCandidate[],
  profileById: ReadonlyMap<number, CoverProfile>
): CoverCandidate[] {
  return candidates.map((candidate) => {
    const profile = profileById.get(candidate.id);
    if (!profile) return candidate;
    return {
      ...candidate,
      ...(profile.userScore !== undefined ? { userScore: profile.userScore } : {}),
      ...(profile.listStatus !== undefined ? { listStatus: profile.listStatus } : {}),
      ...(profile.favourite !== undefined ? { favourite: profile.favourite } : {}),
    };
  });
}

export function findLocalMatch(
  parsed: CoverParsed,
  entries: readonly LocalIndexEntry[]
): { id: number; title: string } | null {
  const searchKey = normCoverKey(parsed.searchTitle);
  const titleKey = normCoverKey(parsed.title);
  // A season-qualified query ("... 2nd Season") must not claim the bare
  // base-season entry: trusting S1 for an S2 release picks the wrong cover
  // with a flat score nothing else can outbid.
  const seasonQualified =
    parsed.season !== undefined && parsed.season > 1 && searchKey !== titleKey;
  for (const wanted of [searchKey, seasonQualified ? "" : titleKey]) {
    if (!wanted) continue;
    for (const entry of entries) {
      const names = new Set([entry.title, ...entry.aliases].map(normCoverKey));
      if (names.has(wanted)) return { id: entry.id, title: entry.title };
    }
  }
  return null;
}

export interface CoverQuery {
  query: string;
  format?: string;
  seasonYear?: number;
}

export const COVER_SCORE_THRESHOLD = 45;
export const COVER_MAX_CANDIDATES = 5;

// Tie-breaker for same-title seasons (S1 vs "2nd Season") when the parsed
// name carries no season marker. Kept below the smallest profile step (5)
// so list status, favourite, and user score still override it.
const UNMARKED_SEASON_PENALTY = 4;

export interface CoverMediaLike {
  id: number;
  title: string;
  title_romaji?: string | null;
  title_english?: string | null;
  titles: string[];
  format?: string | null;
  season_year?: number | null;
  cover_url?: string | null;
}

export function mediaToCandidate(media: CoverMediaLike): CoverCandidate {
  return {
    id: media.id,
    romaji: media.title_romaji ?? media.title,
    english: media.title_english,
    extraTitles: media.titles,
    format: media.format,
    seasonYear: media.season_year,
    coverUrl: media.cover_url,
  };
}

export interface CoverSearchBackend {
  search: (query: CoverQuery) => Promise<CoverCandidate[]>;
  delay?: (ms: number) => Promise<void>;
}

export interface CoverResolution {
  pick: { candidate: CoverCandidate; score: number } | null;
  candidates: CoverCandidate[];
}

const COVER_RETRY_DELAY_MS = 800;

const NO_TRUSTED: ReadonlySet<number> = new Set();
const NO_REJECTED: ReadonlySet<number> = new Set();

export interface ResolveCoverOptions {
  rejected?: ReadonlySet<number>;
  learnedTitle?: string | null;
  profileById?: ReadonlyMap<number, CoverProfile>;
  localTitle?: string | null;
  trustedIds?: ReadonlySet<number>;
  rawTitle?: string | null;
}

export async function resolveCover(
  parsed: CoverParsed,
  backend: CoverSearchBackend,
  opts: ResolveCoverOptions = {}
): Promise<CoverResolution> {
  const {
    rejected = NO_REJECTED,
    learnedTitle,
    profileById,
    localTitle,
    trustedIds = NO_TRUSTED,
    rawTitle,
  } = opts;
  const format = formatFor(parsed.kind);
  const extras = parsed.year ? { seasonYear: parsed.year } : {};
  // Exact local-library hit: one targeted search instead of the cascade.
  // A miss falls through to the full cascade below, so nothing is lost.
  const local = localTitle?.trim();
  if (local) {
    const found = await backend.search({ query: local, format, ...extras });
    const pick = pickCoverCandidate(parsed, found, rejected, learnedTitle, trustedIds);
    if (pick) return { pick, candidates: found.slice(0, COVER_MAX_CANDIDATES) };
  }
  const seen = new Map<number, CoverCandidate>();
  const wait = backend.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const query of buildCoverQueries(parsed, localTitle, rawTitle)) {
      const found = await backend.search(query);
      for (const candidate of found) {
        if (!seen.has(candidate.id)) seen.set(candidate.id, candidate);
      }
      const scored = profileById
        ? withProfile([...seen.values()], profileById)
        : [...seen.values()];
      const pick = pickCoverCandidate(parsed, scored, rejected, learnedTitle, trustedIds);
      if (pick) return { pick, candidates: scored.slice(0, COVER_MAX_CANDIDATES) };
    }
    if (seen.size > 0) break;
    if (attempt === 0) await wait(COVER_RETRY_DELAY_MS);
  }
  const all = profileById ? withProfile([...seen.values()], profileById) : [...seen.values()];
  return {
    pick: pickCoverCandidate(parsed, all, rejected, learnedTitle, trustedIds),
    candidates: all.slice(0, COVER_MAX_CANDIDATES),
  };
}

function formatFor(kind?: string): string {
  return kind === "movie" ? "MOVIE" : "TV";
}

function normalizeMovieQuery(title: string, kind?: string): string | null {
  if (kind !== "movie") return null;
  const rest = title.replace(/^gekijouban\s+/i, "").trim();
  if (!rest || rest === title || /movie/i.test(rest)) return null;
  return `${rest} Movie`;
}

const MUSIC_JUNK_RX: RegExp[] = [
  /^\(?\s*ost\s*\)?\s*/i,
  /\s*\(?\s*ost\s*\)?\s*$/i,
  /\s*\(\s*by\s+[^()[\]]+\)/i,
  /\b\d{4}\s*-\s*\d{4}\b/,
  /\b(mp3|flac|wav|aac|ogg|opus|m4a|ape|tak|wavpack|alac)\b/i,
  /\b\d+\s*(kbps|kbit\/s)\b/i,
  /\(\s*\d+\s*cd\s*\)/i,
  /\bsoundtracks?\b(\s+collection)?/i,
];

export function cleanMusicSegment(segment: string): string {
  let clean = segment;
  let prev = "";
  while (prev !== clean) {
    prev = clean;
    for (const pattern of MUSIC_JUNK_RX) clean = clean.replace(pattern, " ");
    clean = clean
      .replace(/,\s*,/g, ",")
      .replace(/\s*[-,:;]\s*$/, "")
      .trim();
  }
  return clean.replace(/\s{2,}/g, " ").trim();
}

export function stripBracketGroups(value: string): string {
  return value
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildCoverQueries(
  parsed: CoverParsed,
  localTitle?: string | null,
  rawTitle?: string | null
): CoverQuery[] {
  const format = formatFor(parsed.kind);
  const queries: CoverQuery[] = [];
  const push = (query: string, extra?: Partial<CoverQuery>): void => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (queries.some((entry) => entry.query.toLowerCase() === trimmed.toLowerCase())) return;
    queries.push({
      query: trimmed,
      format,
      ...(parsed.year ? { seasonYear: parsed.year } : {}),
      ...extra,
    });
  };
  if (localTitle) push(localTitle);
  for (const alt of parsed.altTitles ?? []) {
    const cleaned = cleanMusicSegment(alt);
    if (cleaned) push(cleaned);
  }
  push(parsed.searchTitle);
  push(parsed.title);
  const colonHead = parsed.title.includes(": ") ? (parsed.title.split(":")[0]?.trim() ?? "") : "";
  if (colonHead) push(colonHead);
  const movieForm = normalizeMovieQuery(parsed.searchTitle, parsed.kind);
  if (movieForm) push(movieForm);
  const titleMovieForm =
    parsed.title === parsed.searchTitle ? null : normalizeMovieQuery(parsed.title, parsed.kind);
  if (titleMovieForm) push(titleMovieForm);
  // Crude last resort that needs no parsing at all: the raw release name
  // with every bracket group stripped. Catches mangled titles the parser
  // could not clean.
  if (rawTitle) push(stripBracketGroups(rawTitle));
  return queries;
}

export const POSTER_TIMEOUT_MS = 5_000;

export function withTimeout<T>(task: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

function franchiseHead(title: string): string[] {
  const head = title.includes(": ") ? (title.split(":")[0] ?? "") : title;
  return head
    .toLowerCase()
    .split(" ")
    .filter((word) => word.length > 2);
}

function franchiseScore(parsed: CoverParsed, candidate: CoverCandidate): number | null {
  const words = franchiseHead(parsed.title);
  if (words.length < 2) return null;
  const haystack = candidateHaystack(candidate);
  const wantFormat = formatFor(parsed.kind);
  if (!words.every((word) => haystack.some((part) => part.includes(word)))) return null;
  if (candidate.format && candidate.format.toUpperCase() !== wantFormat) return null;
  return 40;
}

export function normCoverText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function normCoverKey(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/gu, " ");
}

export interface NormalizedResolvedCover {
  id: number;
  coverUrl: string | null;
  title: string;
  at: number;
  names: string[];
  season: number;
  year?: number;
}

export function normalizeResolvedCover(key: string, entry: ResolvedCover): NormalizedResolvedCover {
  const tail = key.split("|").at(-1) ?? "";
  const keyed = Number.parseInt(tail, 10);
  const names = (entry.names ?? [])
    .map((name) => normCoverKey(name))
    .filter((name) => name.length > 0);
  return {
    id: entry.id,
    coverUrl: entry.coverUrl,
    title: entry.title,
    at: entry.at,
    names: names.length > 0 ? names : [normCoverKey(entry.title)],
    season: entry.season ?? (Number.isNaN(keyed) ? 0 : keyed),
    ...(entry.year === undefined ? {} : { year: entry.year }),
  };
}

export function findResolvedAlias(
  resolved: Record<string, ResolvedCover>,
  lookup: { season: number; names: string[]; year?: number }
): NormalizedResolvedCover | null {
  const wanted = new Set(
    lookup.names.map((name) => normCoverKey(name)).filter((name) => name.length > 0)
  );
  if (wanted.size === 0) return null;
  for (const [key, entry] of Object.entries(resolved)) {
    const candidate = normalizeResolvedCover(key, entry);
    if (candidate.season !== lookup.season) continue;
    if (!candidate.names.some((name) => wanted.has(name))) continue;
    if (
      lookup.year !== undefined &&
      candidate.year !== undefined &&
      candidate.year !== lookup.year
    ) {
      continue;
    }
    return candidate;
  }
  return null;
}

function candidateHaystack(candidate: CoverCandidate): string[] {
  return [candidate.romaji, candidate.english ?? "", ...(candidate.extraTitles ?? [])]
    .map((part) => normCoverText(part))
    .filter((part) => part.length > 0);
}

const SEASON_ROMAN_WORDS: readonly string[] = [
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
  "xii",
];

function seasonOrdinalWord(season: number): string {
  if (season === 1) return "1st";
  if (season === 2) return "2nd";
  if (season === 3) return "3rd";
  return `${season}th`;
}

function seasonTitleBoost(season: number | undefined, haystack: string[]): number {
  if (season === undefined || season < 1 || season > 12) return 0;
  const words = new Set(haystack.flatMap((part) => part.split(" ")));
  const joined = haystack.join(" ");
  const ordinal = seasonOrdinalWord(season);
  if (
    words.has(`s${season}`) ||
    words.has(SEASON_ROMAN_WORDS[season - 1] ?? "") ||
    joined.includes(`${ordinal} season`) ||
    joined.includes(`season ${season}`)
  ) {
    return 30;
  }
  return 0;
}

const TRAILING_SEASON_RX =
  /^(?:s\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s*season|season\s*\d{1,2}|part\s*\d{1,2}|[ivx]{1,4})\.?$/;

function extendsBaseWithSeason(parsed: CoverParsed, candidate: CoverCandidate): boolean {
  const bases = [normCoverText(parsed.title), normCoverText(parsed.searchTitle)].filter(
    (part) => part.length > 0
  );
  const names = [candidate.romaji, candidate.english ?? ""].map(normCoverText);
  return names.some((name) =>
    bases.some((base) => {
      if (!name.startsWith(`${base} `)) return false;
      return TRAILING_SEASON_RX.test(name.slice(base.length + 1));
    })
  );
}

function scoreCoverText(
  parsed: CoverParsed,
  candidate: CoverCandidate,
  haystack: string[]
): number {
  const title = normCoverText(parsed.title);
  const search = normCoverText(parsed.searchTitle);
  if (!title) return 0;
  let score = 0;
  if (haystack.some((part) => part === title || part === search)) score += 50;
  else if (haystack.some((part) => part.includes(title) || title.includes(part))) score += 30;
  else {
    const words = title.split(" ").filter((word) => word.length > 2);
    const hits = words.filter((word) => haystack.some((part) => part.includes(word))).length;
    if (!(words.length > 0 && hits === words.length)) return score;
    score += 20;
  }
  if (parsed.arc) {
    const arcWords = parsed.arc
      .toLowerCase()
      .replace(/-/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && w !== "hen");
    if (
      arcWords.length > 0 &&
      arcWords.every((word) => haystack.some((part) => part.includes(word)))
    ) {
      score += 25;
    }
  }
  const wantFormat = formatFor(parsed.kind);
  if (candidate.format && candidate.format.toUpperCase() === wantFormat) score += 15;
  score += seasonTitleBoost(parsed.season, haystack);
  if (parsed.season === undefined && extendsBaseWithSeason(parsed, candidate)) {
    score -= UNMARKED_SEASON_PENALTY;
  }
  if (
    parsed.year !== undefined &&
    candidate.seasonYear !== null &&
    candidate.seasonYear !== undefined
  ) {
    if (candidate.seasonYear === parsed.year) score += 15;
    else if (Math.abs(candidate.seasonYear - parsed.year) === 1) score += 5;
    else score -= 10;
  }
  return score;
}

function profileBoost(candidate: CoverCandidate): number | null {
  if (candidate.listStatus === "DROPPED") return null;
  let boost = 0;
  if (candidate.listStatus === "CURRENT") boost += 15;
  else if (candidate.listStatus === "COMPLETED" || candidate.listStatus === "REPEATING")
    boost += 10;
  else if (candidate.listStatus === "PLANNING") boost += 5;
  if (candidate.favourite) boost += 10;
  if (
    candidate.userScore !== null &&
    candidate.userScore !== undefined &&
    candidate.userScore >= 8
  ) {
    boost += 5;
  }
  return boost;
}

export function scoreCoverCandidate(
  parsed: CoverParsed,
  candidate: CoverCandidate,
  learnedTitle?: string | null,
  trustedIds: ReadonlySet<number> = NO_TRUSTED
): number {
  if (trustedIds.has(candidate.id)) return 100;
  const haystack = candidateHaystack(candidate);
  if (haystack.length === 0) return 0;
  if (learnedTitle && haystack.includes(normCoverText(learnedTitle))) return 100;
  const boost = profileBoost(candidate);
  if (boost === null) return -1000;
  return scoreCoverText(parsed, candidate, haystack) + boost;
}

export function pickCoverCandidate(
  parsed: CoverParsed,
  candidates: CoverCandidate[],
  rejected: ReadonlySet<number> = NO_REJECTED,
  learnedTitle?: string | null,
  trustedIds: ReadonlySet<number> = NO_TRUSTED
): { candidate: CoverCandidate; score: number } | null {
  let best: { candidate: CoverCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    if (rejected.has(candidate.id)) continue;
    const score = scoreCoverCandidate(parsed, candidate, learnedTitle, trustedIds);
    if (score >= COVER_SCORE_THRESHOLD && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  if (best) return best;
  for (const candidate of candidates) {
    if (rejected.has(candidate.id)) continue;
    const score = franchiseScore(parsed, candidate);
    if (score !== null && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best;
}
