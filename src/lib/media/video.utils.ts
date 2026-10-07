import {
  IGNORE_SUFFIXES,
  KNOWN_ARCS,
  LEADING_NUMBER_RX,
  SEARCH_ALIASES,
} from "@/config/media/tokens.config";
import { canonicalLang, classifyMediaTokens, collectFields } from "@/lib/media/classify.utils";
import {
  extractEpisode,
  extractPart,
  extractSeason,
  extractTvSeason,
} from "@/lib/media/episode.utils";
import { resolveSegments } from "@/lib/media/segments.utils";
import { tokenizeMediaName } from "@/lib/media/tokenize.utils";
import type { DirContext, FieldBag, MediaClassifiedToken, MediaFileParse } from "@/types/media";

const ROMAN_SEASON: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
const SINGLE_KEEP_RX = /^[vix]$/i;

export function dropTrailingSingle(words: string[]): string[] {
  if (words.length === 0) return words;
  const tail = words.at(-1);
  if (tail && /^[A-Z]$/.test(tail) && !SINGLE_KEEP_RX.test(tail)) return words.slice(0, -1);
  return words;
}

export function dropSeasonDescriptors(words: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words.at(index) ?? "";
    const next = words.at(index + 1) ?? "";
    const after = words.at(index + 2) ?? "";
    if (/^the$/i.test(word) && /^final$/i.test(next) && /^season$/i.test(after)) {
      index += 2;
      continue;
    }
    if (/^final$/i.test(word) && /^season$/i.test(next)) {
      index += 1;
      continue;
    }
    out.push(word);
  }
  return out;
}

export function matchKnownArc(
  words: string[],
  arcs: readonly string[]
): {
  title: string;
  arc: string;
} | null {
  const lower = words.map((word) => word.toLowerCase());
  for (const arc of arcs) {
    const arcWords = arc.toLowerCase().replace(/-/g, " ").split(" ");
    if (arcWords.length > words.length) continue;
    const tail = lower.slice(-arcWords.length);
    if (tail.join(" ") === arcWords.join(" ")) {
      return { title: words.slice(0, -arcWords.length).join(" "), arc };
    }
  }
  return null;
}

type FallbackDecision =
  | { kind: "episode"; value: number; index: number }
  | { kind: "title"; value: number; index: number }
  | { kind: "sequel"; value: number }
  | { kind: "none" };

interface FallbackOptions {
  season?: number;
  year?: number;
  hasTech: boolean;
  hasMovieRoot: boolean;
  dirHasTitle: boolean;
  stem: string;
}

export function decideFallbackEpisode(
  tokens: MediaClassifiedToken[],
  fallbackIndex: number,
  opts: FallbackOptions
): FallbackDecision {
  const token = tokens.at(fallbackIndex);
  if (!token) return { kind: "none" };
  const value = Number.parseInt(token.value, 10);
  if (opts.year !== undefined && opts.hasMovieRoot) {
    return { kind: "title", value, index: fallbackIndex };
  }
  const dashBefore = new RegExp(`-\\s*${token.value}(\\s*[[(]|\\s*$)`).test(opts.stem);
  if (dashBefore || opts.season !== undefined) {
    return { kind: "episode", value, index: fallbackIndex };
  }
  if (opts.hasTech && value <= 3 && !opts.dirHasTitle) return { kind: "sequel", value };
  return { kind: "episode", value, index: fallbackIndex };
}

export function assembleTitleWords(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>,
  tags: string[],
  extras: string[] = []
): string[] {
  const words = [...extras];
  tokens.forEach((token, index) => {
    if (token.kind === "type" && /gekijouban/i.test(token.value)) {
      words.push(token.value);
      return;
    }
    if (token.kind === "episode" && !consumed.has(index) && /^\d{1,3}$/.test(token.value)) {
      words.push(token.value);
      return;
    }
    if (token.kind !== "title" || consumed.has(index)) return;
    if (IGNORE_SUFFIXES.includes(token.value.toLowerCase())) {
      tags.push(token.value);
      return;
    }
    const next = tokens.at(index + 1);
    if (token.value.toLowerCase() === "by" && (next?.kind === "group" || next?.kind === "studio")) {
      return;
    }
    words.push(token.value);
  });
  return words;
}

function seasonOrdinal(season: number): string {
  if (season === 2) return "nd";
  if (season === 3) return "rd";
  return "th";
}

const CYRILLIC_RX = new RegExp(`[${String.fromCodePoint(0x0400)}-${String.fromCodePoint(0x04ff)}]`);

function hasCyrillic(text: string): boolean {
  return CYRILLIC_RX.test(text);
}

export function aliasSearchTitle(
  title: string,
  aliases: ReadonlyArray<readonly [string, string]>
): string | null {
  for (const [from, to] of aliases) {
    if (from.toLowerCase() === title.toLowerCase()) return to;
  }
  return null;
}

export function finalizeSearchTitle(params: {
  title: string;
  arc?: string;
  prefix?: string;
  season?: number;
  aliases: ReadonlyArray<readonly [string, string]>;
}): string {
  if (params.arc) return `${params.title}: ${params.arc}`;
  if (params.prefix) return `${params.prefix}: ${params.title}`;
  const aliased = aliasSearchTitle(params.title, params.aliases);
  if (aliased) return aliased;
  if (params.season !== undefined && params.season > 1) {
    return `${params.title} ${params.season}${seasonOrdinal(params.season)} Season`;
  }
  return params.title;
}

export function extractEpTitle(
  tokens: MediaClassifiedToken[],
  atomIndex: number,
  consumed: Set<number>
): { title?: string; ignored: string[] } {
  if (atomIndex < 0) return { ignored: [] };
  const words: string[] = [];
  const ignored: string[] = [];
  let end = atomIndex + 1;
  for (let index = atomIndex + 1; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (!token) break;
    if (token.kind === "title") {
      if (IGNORE_SUFFIXES.includes(token.value.toLowerCase())) {
        ignored.push(token.value);
        end = index + 1;
        continue;
      }
      words.push(token.value);
      end = index + 1;
      continue;
    }
    if (
      token.kind === "year" &&
      /^\d{4}$/.test(token.value) &&
      (tokens.at(index + 1)?.kind === "service" || tokens.at(index + 1)?.kind === "source")
    ) {
      words.push(token.value);
      end = index + 1;
      consumed.add(index);
      continue;
    }
    break;
  }
  if (words.length === 0) return { ignored };
  for (let index = atomIndex + 1; index < end; index += 1) consumed.add(index);
  return { title: words.join(" "), ignored };
}

function collectAudioLangs(tokens: MediaClassifiedToken[]): string[] {
  const langs: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (!token || token.kind !== "audio" || token.bracketGroup === undefined) continue;
    const groupId = token.bracketGroup;
    let run = index;
    while (run < tokens.length && tokens.at(run)?.bracketGroup === groupId) run += 1;
    for (let inner = index; inner < run; inner += 1) {
      const candidate = tokens.at(inner);
      if (candidate?.kind === "lang") {
        const lang = canonicalLang(candidate.value);
        if (lang && !langs.includes(lang)) langs.push(lang);
      }
    }
    index = run - 1;
  }
  return langs;
}

interface VideoHead {
  tokens: MediaClassifiedToken[];
  consumed: Set<number>;
  season?: number;
  variant?: string;
  part?: number;
  episode?: number;
  episodeAlt?: number;
  ofTotal?: number;
  atomIndex: number;
  fallbackIndex: number;
  bag: FieldBag;
  year?: number;
  kind: MediaFileParse["kind"];
  confidence: number;
  leading: RegExpExecArray | null;
  rangeMatch: RegExpExecArray | null;
  titleExtras: string[];
  tags: string[];
}

function initVideoKind(tokens: MediaClassifiedToken[], bag: FieldBag): MediaFileParse["kind"] {
  if (bag.special) return "special";
  const theatrical = tokens.some(
    (token) => token.kind === "type" && /gekijouban/i.test(token.value)
  );
  if (theatrical) return "movie";
  if (bag.type && bag.type.toLowerCase() !== "tv" && bag.type.toLowerCase() !== "gekijouban") {
    return "movie";
  }
  return "tv";
}

function initSeasonField(
  tokens: MediaClassifiedToken[],
  consumed: Set<number>
): { season?: number; variant?: string } {
  const seasonHit = extractSeason(tokens);
  for (const index of seasonHit.consumed) consumed.add(index);
  let season = seasonHit.season > 0 ? seasonHit.season : undefined;
  let variant = seasonHit.variant;
  if (season === undefined) {
    const tvHit = extractTvSeason(tokens, consumed);
    if (tvHit) {
      season = tvHit.season;
      variant = tvHit.variant;
    }
  }
  return { season, variant };
}

function startVideoHead(ctx: DirContext, stem: string): VideoHead {
  const leadingMatch = LEADING_NUMBER_RX.exec(stem);
  const leading = (leadingMatch?.[2]?.includes(" ") ?? false) ? leadingMatch : null;
  const rangeMatch = /^(\d{1,3})-(\d{1,3})\.\s*(.+)$/.exec(stem);
  const tokens = classifyMediaTokens(tokenizeMediaName(stem));
  const consumed = new Set<number>();
  const { season: parsedSeason, variant } = initSeasonField(tokens, consumed);
  let season = parsedSeason;
  const partHit = extractPart(tokens);
  for (const index of partHit.consumed) consumed.add(index);
  const episodeHit = extractEpisode(tokens);
  for (const index of episodeHit.consumed) consumed.add(index);
  const bag = collectFields(tokens, consumed);

  let confidence = 1;
  if (season === undefined && ctx.season !== undefined) {
    season = ctx.season;
    confidence -= 0.1;
  } else if (season !== undefined && ctx.season !== undefined && ctx.season !== season) {
    confidence -= 0.15;
  }
  if (bag.year !== undefined && ctx.year !== undefined && bag.year !== ctx.year) {
    confidence -= 0.1;
  }

  let episode = episodeHit.number;
  if (bag.special && episode === undefined) {
    const digits = /(\d+)$/.exec(bag.special);
    if (digits?.[1]) episode = Number.parseInt(digits[1], 10);
  }

  return {
    tokens,
    consumed,
    season,
    variant,
    part: partHit.part,
    episode,
    episodeAlt: episodeHit.numberAlt,
    ofTotal: episodeHit.ofTotal,
    atomIndex: episodeHit.atomIndex,
    fallbackIndex: episodeHit.fallbackIndex,
    bag,
    year: bag.year ?? ctx.year,
    kind: initVideoKind(tokens, bag),
    confidence,
    leading,
    rangeMatch,
    titleExtras: [],
    tags: [...bag.tags],
  };
}

function applyLeadingReturn(ctx: DirContext, head: VideoHead): MediaFileParse | null {
  if (head.rangeMatch?.[1] && head.rangeMatch[2] && head.rangeMatch[3]) {
    return finishLeading(ctx, {
      ...leadingBase(head.bag),
      episode: Number.parseInt(head.rangeMatch[1], 10),
      episodeAlt: Number.parseInt(head.rangeMatch[2], 10),
      epTitle: head.rangeMatch[3].trim(),
      part: head.part,
      year: head.year,
      kind: head.kind,
      audioLangs: collectAudioLangs(head.tokens),
      confidence: head.confidence - 0.2,
    });
  }
  if (head.leading?.[1] && head.leading[2]) {
    const parsed = leadingEpisode(head.leading[2].trim(), head.part);
    return finishLeading(ctx, {
      ...leadingBase(head.bag),
      episode: Number.parseInt(head.leading[1], 10),
      epTitle: parsed.epTitle,
      part: parsed.part,
      year: head.year,
      kind: head.kind,
      audioLangs: collectAudioLangs(head.tokens),
      confidence: head.confidence - 0.2,
    });
  }
  return null;
}

function applyFallbackReturn(
  ctx: DirContext,
  stem: string,
  head: VideoHead
): MediaFileParse | null {
  if (head.episode !== undefined || head.fallbackIndex < 0) return null;
  const decision = decideFallbackEpisode(head.tokens, head.fallbackIndex, {
    season: head.season,
    year: head.year,
    hasTech:
      head.bag.source !== undefined ||
      head.bag.service !== undefined ||
      head.bag.codec !== undefined,
    hasMovieRoot: ctx.hasMovieRoot,
    dirHasTitle: ctx.titleWords.length > 0,
    stem,
  });
  if (decision.kind === "sequel") {
    head.consumed.add(head.fallbackIndex);
    return finishSequel(ctx, head.tokens, head.consumed, [], {
      sequel: decision.value,
      year: head.year,
      kind: "movie",
      type: head.bag.type,
      dub: head.bag.dub,
      special: head.bag.special,
      source: head.bag.source,
      service: head.bag.service,
      codec: head.bag.codec,
      resolution: head.bag.resolution,
      depth: head.bag.depth,
      audio: head.bag.audio,
      audioLangs: collectAudioLangs(head.tokens),
      subs: head.bag.subs,
      subVariant: head.bag.subVariant,
      crc: head.bag.crc,
      tags: head.bag.tags,
      groups: head.bag.groups,
      langs: head.bag.langs,
      confidence: head.confidence - 0.2,
    });
  }
  if (decision.kind === "title") {
    const titleToken = head.tokens.at(decision.index);
    if (titleToken) head.titleExtras.push(titleToken.value);
    head.consumed.add(decision.index);
    head.kind = "movie";
    return null;
  }
  if (decision.kind === "episode") {
    head.episode = decision.value;
    head.consumed.add(decision.index);
  }
  return null;
}

function decideVideoKind(
  head: VideoHead,
  hasMovieRoot: boolean,
  hasSpecial: boolean
): MediaFileParse["kind"] {
  if (head.episode === undefined && head.year !== undefined && head.kind === "tv") {
    return "movie";
  }
  if (head.episode === undefined && hasMovieRoot && head.kind === "tv" && head.year === undefined) {
    return "movie";
  }
  if (hasSpecial && head.kind === "tv") return "special";
  return head.kind;
}

function buildVideoTitle(
  head: VideoHead,
  ctx: DirContext,
  dirRaw: string,
  stem: string
): { title: string; arc?: string; prefix?: string; epTitle?: string; movieHint?: boolean } {
  const epTitleHit = extractEpTitle(head.tokens, head.atomIndex, head.consumed);
  for (const ignored of epTitleHit.ignored) head.tags.push(ignored);
  const titleWords = assembleTitleWords(head.tokens, head.consumed, head.tags, head.titleExtras);
  const romanTail = titleWords.at(-1)?.toLowerCase();
  if (
    romanTail &&
    ROMAN_SEASON[romanTail] !== undefined &&
    head.kind === "tv" &&
    head.episode !== undefined &&
    head.season === undefined
  ) {
    head.season = ROMAN_SEASON[romanTail];
  }
  const cleaned = dropSeasonDescriptors(dropTrailingSingle(titleWords));
  const arcMatch = matchKnownArc(cleaned, KNOWN_ARCS);
  let arc: string | undefined;
  let baseWords = cleaned;
  if (arcMatch) {
    baseWords = arcMatch.title.split(" ").filter((word) => word.length > 0);
    arc = arcMatch.arc;
  }
  let fallbackTitle = baseWords.join(" ");
  const dirTitle = ctx.titleWords.join(" ");
  if (fallbackTitle.length === 0 && dirTitle.length > 0) {
    fallbackTitle = dirTitle;
    head.confidence -= 0.2;
  }
  const seg = resolveSegments(stem, dirRaw, fallbackTitle);
  let title = seg.title;
  if (seg.arc) arc = seg.arc;
  if (title.length === 0) title = fallbackTitle;
  return { title, arc, prefix: seg.prefix, epTitle: epTitleHit.title, movieHint: seg.movieHint };
}

function mergeVideoContext(
  head: VideoHead,
  ctx: DirContext
): { groups: string[]; langs: string[] } {
  const groups = [...head.bag.groups];
  const langs = [...head.bag.langs];
  for (const group of ctx.groups) {
    if (!groups.includes(group)) groups.push(group);
  }
  for (const lang of ctx.langs) {
    if (!langs.includes(lang)) langs.push(lang);
  }
  for (const token of head.tokens) {
    if (token.kind === "lang") {
      const lang = canonicalLang(token.value);
      if (lang && !langs.includes(lang)) langs.push(lang);
    }
  }
  return { groups, langs };
}

function buildVideoResult(
  head: VideoHead,
  title: string,
  arc: string | undefined,
  searchTitle: string,
  epTitle: string | undefined,
  groups: string[],
  langs: string[]
): MediaFileParse {
  return {
    title,
    searchTitle,
    ...(head.season !== undefined ? { season: head.season } : {}),
    ...(head.part !== undefined ? { part: head.part } : {}),
    ...videoEpisodePart(head.episode, head.episodeAlt, epTitle, head.ofTotal),
    ...(head.year !== undefined ? { year: head.year } : {}),
    kind: head.kind,
    ...videoTechPart({
      groups,
      langs,
      audio: head.bag.audio,
      audioLangs: collectAudioLangs(head.tokens),
      subs: head.bag.subs,
      source: head.bag.source,
      service: head.bag.service,
      codec: head.bag.codec,
      resolution: head.bag.resolution,
      depth: head.bag.depth,
      crc: head.bag.crc,
    }),
    ...videoFlagPart({
      arc,
      variant: head.variant,
      special: head.bag.special,
      tags: head.tags,
      confidence: head.confidence,
      type: head.bag.type,
      dub: head.bag.dub,
      subVariant: head.bag.subVariant,
    }),
  };
}

export function resolveVideo(ctx: DirContext, dirRaw: string, stem: string): MediaFileParse {
  const head = startVideoHead(ctx, stem);
  const early = applyLeadingReturn(ctx, head);
  if (early) return early;
  const sequel = applyFallbackReturn(ctx, stem, head);
  if (sequel) return sequel;
  head.kind = decideVideoKind(head, ctx.hasMovieRoot, ctx.hasSpecial);
  const { title, arc, prefix, epTitle, movieHint } = buildVideoTitle(head, ctx, dirRaw, stem);
  if (movieHint && head.episode === undefined) head.kind = "movie";
  const { groups, langs } = mergeVideoContext(head, ctx);
  if (head.tokens.some((token) => token.kind === "unknown")) head.confidence -= 0.1;
  if (langs.length === 0 && hasCyrillic(`${title} ${epTitle ?? ""}`)) {
    langs.push("rus");
  }
  const searchTitle = finalizeSearchTitle({
    title,
    arc,
    prefix,
    season: head.season,
    aliases: SEARCH_ALIASES,
  });
  return buildVideoResult(head, title, arc, searchTitle, epTitle, groups, langs);
}

function videoEpisodePart(
  episode?: number,
  episodeAlt?: number,
  epTitle?: string,
  ofTotal?: number
): Pick<MediaFileParse, "episode"> {
  return {
    episode: {
      ...(episode !== undefined ? { number: episode } : {}),
      ...(episodeAlt !== undefined ? { numberAlt: episodeAlt } : {}),
      ...(epTitle ? { title: epTitle } : {}),
      ...(ofTotal !== undefined ? { ofTotal } : {}),
    },
  };
}

interface TechInput {
  groups: string[];
  langs: string[];
  audio?: string;
  audioLangs: string[];
  subs: string[];
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  depth?: string;
  crc?: string;
}

function videoTechPart(
  input: TechInput
): Pick<MediaFileParse, "groups" | "lang"> & Partial<MediaFileParse> {
  return {
    groups: input.groups,
    lang: input.langs,
    ...(input.audio ? { audio: input.audio } : {}),
    ...(input.audioLangs.length > 0 ? { audioLang: input.audioLangs } : {}),
    ...(input.subs.length > 0 ? { subs: input.subs } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.service ? { service: input.service } : {}),
    ...(input.codec ? { codec: input.codec } : {}),
    ...(input.resolution ? { resolution: input.resolution } : {}),
    ...(input.depth ? { depth: input.depth } : {}),
    ...(input.crc ? { crc: input.crc } : {}),
  };
}

interface FlagInput {
  arc?: string;
  variant?: string;
  special?: string;
  tags: string[];
  confidence: number;
  type?: string;
  dub: boolean;
  subVariant?: string;
}

function videoFlagPart(
  input: FlagInput
): Pick<MediaFileParse, "tags" | "confidence"> & Partial<MediaFileParse> {
  return {
    ...(input.arc ? { arc: input.arc } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.special ? { special: input.special } : {}),
    tags: input.tags,
    confidence: Math.max(0, Math.round(input.confidence * 100) / 100),
    ...(input.type ? { type: input.type } : {}),
    ...(input.dub ? { dub: input.dub } : {}),
    ...(input.subVariant ? { subVariant: input.subVariant } : {}),
  };
}

function leadingEpisodePart(hit: {
  episode?: number;
  episodeAlt?: number;
  epTitle: string;
}): Pick<MediaFileParse, "episode"> {
  return {
    episode: {
      ...(hit.episode !== undefined ? { number: hit.episode } : {}),
      ...(hit.episodeAlt !== undefined ? { numberAlt: hit.episodeAlt } : {}),
      ...(hit.epTitle ? { title: hit.epTitle } : {}),
    },
  };
}

interface LeadingTech {
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  depth?: string;
  audio?: string;
  subs: string[];
  subVariant?: string;
  crc?: string;
}

function leadingTechPart(hit: LeadingTech): Partial<MediaFileParse> {
  return {
    ...(hit.source ? { source: hit.source } : {}),
    ...(hit.service ? { service: hit.service } : {}),
    ...(hit.codec ? { codec: hit.codec } : {}),
    ...(hit.resolution ? { resolution: hit.resolution } : {}),
    ...(hit.depth ? { depth: hit.depth } : {}),
    ...(hit.audio ? { audio: hit.audio } : {}),
    ...(hit.subs.length > 0 ? { subs: hit.subs } : {}),
    ...(hit.subVariant ? { subVariant: hit.subVariant } : {}),
    ...(hit.crc ? { crc: hit.crc } : {}),
  };
}

interface LeadingFlags {
  part?: number;
  year?: number;
  tags: string[];
  confidence: number;
  type?: string;
  dub: boolean;
}

function leadingFlagPart(
  hit: LeadingFlags
): Pick<MediaFileParse, "tags" | "confidence"> & Partial<MediaFileParse> {
  return {
    ...(hit.part !== undefined ? { part: hit.part } : {}),
    ...(hit.year !== undefined ? { year: hit.year } : {}),
    tags: hit.tags,
    confidence: Math.max(0, Math.round(hit.confidence * 100) / 100),
    ...(hit.type ? { type: hit.type } : {}),
    ...(hit.dub ? { dub: hit.dub } : {}),
  };
}

interface LeadingResult {
  episode?: number;
  episodeAlt?: number;
  epTitle: string;
  part?: number;
  year?: number;
  kind: MediaFileParse["kind"];
  type?: string;
  dub: boolean;
  special?: string;
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  depth?: string;
  audio?: string;
  audioLangs: string[];
  subs: string[];
  subVariant?: string;
  crc?: string;
  tags: string[];
  groups: string[];
  langs: string[];
  confidence: number;
}

function finishLeading(ctx: DirContext, hit: LeadingResult): MediaFileParse {
  const title = ctx.titleWords.join(" ");
  const searchTitle = aliasSearchTitle(title, SEARCH_ALIASES) ?? title;
  const lang = hit.langs.length > 0 ? hit.langs : ctx.langs;
  if (lang.length === 0 && hasCyrillic(`${title} ${hit.epTitle}`)) lang.push("rus");
  return {
    title,
    searchTitle,
    ...leadingEpisodePart(hit),
    ...leadingTechPart({
      source: hit.source ?? ctx.source,
      service: hit.service ?? ctx.service,
      codec: hit.codec ?? ctx.codec,
      resolution: hit.resolution ?? ctx.resolution,
      depth: hit.depth,
      audio: hit.audio,
      subs: hit.subs,
      subVariant: hit.subVariant,
      crc: hit.crc,
    }),
    ...leadingFlagPart(hit),
    kind: hit.kind,
    groups: hit.groups,
    lang,
    ...(hit.audioLangs.length > 0 ? { audioLang: hit.audioLangs } : {}),
  };
}

interface SequelResult {
  sequel: number;
  year?: number;
  kind: MediaFileParse["kind"];
  type?: string;
  dub: boolean;
  special?: string;
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  depth?: string;
  audio?: string;
  audioLangs: string[];
  subs: string[];
  subVariant?: string;
  crc?: string;
  tags: string[];
  groups: string[];
  langs: string[];
  confidence: number;
}

function finishSequel(
  ctx: DirContext,
  tokens: MediaClassifiedToken[],
  consumed: Set<number>,
  titleExtras: string[],
  hit: SequelResult
): MediaFileParse {
  const tags: string[] = [];
  const title = assembleTitleWords(tokens, consumed, tags, titleExtras).join(" ");
  const resolvedTitle = title.length > 0 ? title : ctx.titleWords.join(" ");
  const searchTitle = aliasSearchTitle(resolvedTitle, SEARCH_ALIASES) ?? resolvedTitle;
  return {
    title: resolvedTitle,
    searchTitle,
    episode: {},
    ...(hit.year !== undefined ? { year: hit.year } : {}),
    kind: hit.kind,
    groups: hit.groups,
    lang: hit.langs,
    ...(hit.audio ? { audio: hit.audio } : {}),
    ...(hit.audioLangs.length > 0 ? { audioLang: hit.audioLangs } : {}),
    ...(hit.subs.length > 0 ? { subs: hit.subs } : {}),
    ...(hit.source ? { source: hit.source } : {}),
    ...(hit.service ? { service: hit.service } : {}),
    ...(hit.codec ? { codec: hit.codec } : {}),
    ...(hit.resolution ? { resolution: hit.resolution } : {}),
    ...(hit.depth ? { depth: hit.depth } : {}),
    ...(hit.crc ? { crc: hit.crc } : {}),
    sequel: hit.sequel,
    tags: [...hit.tags, ...tags],
    confidence: Math.max(0, Math.round(hit.confidence * 100) / 100),
    ...(hit.type ? { type: hit.type } : {}),
    ...(hit.dub ? { dub: hit.dub } : {}),
    ...(hit.subVariant ? { subVariant: hit.subVariant } : {}),
  };
}

function leadingBase(bag: FieldBag): {
  type?: string;
  dub: boolean;
  special?: string;
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  depth?: string;
  audio?: string;
  subs: string[];
  subVariant?: string;
  crc?: string;
  tags: string[];
  groups: string[];
  langs: string[];
} {
  return {
    type: bag.type,
    dub: bag.dub,
    special: bag.special,
    source: bag.source,
    service: bag.service,
    codec: bag.codec,
    resolution: bag.resolution,
    depth: bag.depth,
    audio: bag.audio,
    subs: bag.subs,
    subVariant: bag.subVariant,
    crc: bag.crc,
    tags: bag.tags,
    groups: bag.groups,
    langs: bag.langs,
  };
}

function leadingEpisode(
  rest: string,
  part: number | undefined
): { epTitle: string; part?: number } {
  const paren = /\(([^)]*)\)\s*$/.exec(rest);
  if (!paren?.[1]) return { epTitle: rest, part };
  const partMatch = /part\s+(\d+)/i.exec(paren[1]);
  if (!partMatch?.[1]) return { epTitle: rest, part };
  return { epTitle: rest.slice(0, paren.index).trim(), part: Number.parseInt(partMatch[1], 10) };
}
