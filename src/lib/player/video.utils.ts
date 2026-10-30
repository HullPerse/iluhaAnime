import { KNOWN_ARCS, LEADING_NUMBER_RX, SEARCH_ALIASES } from "@/config/graphics/tokens.config";
import { resolveSegments } from "@/lib/core/segments.utils";
import { tokenizeMediaName } from "@/lib/graphics/tokenize.utils";
import {
  canonicalLang,
  classifyMediaTokens,
  collectFields,
} from "@/lib/player/mediaClassify.utils";
import {
  extractEpisode,
  extractPart,
  extractSeason,
  extractTvSeason,
} from "@/lib/player/episode.utils";
import {
  collectAudioLangs,
  finishLeading,
  finishSequel,
  leadingBase,
  leadingEpisode,
  videoEpisodePart,
  videoFlagPart,
  videoTechPart,
} from "@/lib/player/videoParts.utils";
import {
  ROMAN_SEASON,
  absorbConsumed,
  absorbStrings,
  assembleTitleWords,
  decideFallbackEpisode,
  dropSeasonDescriptors,
  dropTrailingSingle,
  extractEpTitle,
  finalizeSearchTitle,
  hasCyrillic,
  matchKnownArc,
} from "@/lib/player/videoTitle.utils";
import type {
  DirContext,
  FieldBag,
  MediaClassifiedToken,
  MediaFileParse,
} from "@/types/player/media";

const MAX_CLASSIFY_CACHE = 4096;
const classifyCache = new Map<string, ReturnType<typeof classifyMediaTokens>>();

function classifyCached(stem: string): ReturnType<typeof classifyMediaTokens> {
  const cached = classifyCache.get(stem);
  if (cached !== undefined) return cached;
  const result = classifyMediaTokens(tokenizeMediaName(stem));
  if (classifyCache.size >= MAX_CLASSIFY_CACHE) {
    const first = classifyCache.keys().next();
    if (!first.done) classifyCache.delete(first.value);
  }
  classifyCache.set(stem, result);
  return result;
}

const partCache = new Map<MediaClassifiedToken[], ReturnType<typeof extractPart>>();
function extractPartCached(tokens: MediaClassifiedToken[]): ReturnType<typeof extractPart> {
  const cached = partCache.get(tokens);
  if (cached !== undefined) return cached;
  const result = extractPart(tokens);
  partCache.set(tokens, result);
  return result;
}

const episodeCache = new Map<MediaClassifiedToken[], ReturnType<typeof extractEpisode>>();
function extractEpisodeCached(tokens: MediaClassifiedToken[]): ReturnType<typeof extractEpisode> {
  const cached = episodeCache.get(tokens);
  if (cached !== undefined) return cached;
  const result = extractEpisode(tokens);
  episodeCache.set(tokens, result);
  return result;
}

const seasonCache = new Map<MediaClassifiedToken[], ReturnType<typeof extractSeason>>();
function extractSeasonCached(tokens: MediaClassifiedToken[]): ReturnType<typeof extractSeason> {
  const cached = seasonCache.get(tokens);
  if (cached !== undefined) return cached;
  const result = extractSeason(tokens);
  seasonCache.set(tokens, result);
  return result;
}

const collectFieldsCache = new Map<MediaClassifiedToken[], FieldBag>();
function collectFieldsCached(tokens: MediaClassifiedToken[], consumed: Set<number>): FieldBag {
  const cached = collectFieldsCache.get(tokens);
  if (cached !== undefined) {
    return {
      groups: [...cached.groups],
      langs: [...cached.langs],
      subs: [...cached.subs],
      tags: [...cached.tags],
      dub: cached.dub,
      special: cached.special,
      type: cached.type,
      source: cached.source,
      service: cached.service,
      codec: cached.codec,
      resolution: cached.resolution,
      depth: cached.depth,
      year: cached.year,
      audio: cached.audio,
      crc: cached.crc,
      subVariant: cached.subVariant,
      season: cached.season,
      variant: cached.variant,
    };
  }
  const result = collectFields(tokens, consumed);
  collectFieldsCache.set(tokens, result);
  return result;
}

interface VideoHead {
  tokens: MediaClassifiedToken[];
  consumed: Set<number>;
  season?: number;
  variant?: string;
  part?: number;
  episode?: number;
  episodeAlt?: number;
  episodeVersion?: number;
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
  const seasonHit = extractSeasonCached(tokens);
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
  const tokens = classifyCached(stem);
  const consumed = new Set<number>();
  const { season: parsedSeason, variant } = initSeasonField(tokens, consumed);
  let season = parsedSeason;
  const partHit = extractPartCached(tokens);
  absorbConsumed(consumed, partHit.consumed);
  const episodeHit = extractEpisodeCached(tokens);
  absorbConsumed(consumed, episodeHit.consumed);
  const bag = collectFieldsCached(tokens, consumed);
  absorbStrings(bag.subs, ctx.subs);
  if (bag.subVariant === undefined) bag.subVariant = ctx.subVariant;

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
    episodeVersion: episodeHit.version,
    ofTotal: episodeHit.ofTotal ?? ctx.ofTotal,
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
  const epTitleHit = extractEpTitle(head.tokens, head.atomIndex, head.consumed, head.fallbackIndex);
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
  const groupsSet = new Set(head.bag.groups);
  const groups: string[] = [];
  for (const group of head.bag.groups) groups.push(group);
  for (const group of ctx.groups) {
    if (!groupsSet.has(group)) {
      groupsSet.add(group);
      groups.push(group);
    }
  }
  const langsSet = new Set(head.bag.langs);
  const langs: string[] = [];
  for (const lang of head.bag.langs) langs.push(lang);
  for (const lang of ctx.langs) {
    if (!langsSet.has(lang)) {
      langsSet.add(lang);
      langs.push(lang);
    }
  }
  for (const token of head.tokens) {
    if (token.kind === "lang") {
      const lang = canonicalLang(token.value);
      if (lang && !langsSet.has(lang)) {
        langsSet.add(lang);
        langs.push(lang);
      }
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
    ...videoEpisodePart(head.episode, head.episodeAlt, epTitle, head.episodeVersion, head.ofTotal),
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
