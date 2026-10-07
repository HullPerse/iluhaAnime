import { AUDIO_EXTS, SUBTITLE_EXTS } from "@/config/media/tokens.config";
import { classifyMediaTokens, collectFields } from "@/lib/media/classify.utils";
import { extractSeason, extractTvSeason } from "@/lib/media/episode.utils";
import { parseSidecarSuffix, splitSidecarStem } from "@/lib/media/sidecar.utils";
import { stripMediaExtension, tokenizeMediaName } from "@/lib/media/tokenize.utils";
import { resolveVideo } from "@/lib/media/video.utils";
import { createLruCache } from "@/lib/utils/lruCache.utils";
import type { DirContext, MediaFileParse } from "@/types/media";

const MAX_DIR_CONTEXT_CACHE = 200;
const dirContextCache = createLruCache<string, DirContext>(MAX_DIR_CONTEXT_CACHE);

function splitDir(dir: string | null): string[] {
  if (!dir) return [];
  return dir.split(/[\\/]/).filter((part) => part.length > 0);
}

const ROOT_NAMES = new Set(["anime", "movies"]);

function analyzeSegment(segment: string): {
  titleWords: string[];
  season?: number;
  year?: number;
  source?: string;
  service?: string;
  codec?: string;
  resolution?: string;
  groups: string[];
  langs: string[];
  special: boolean;
} {
  const tokens = classifyMediaTokens(tokenizeMediaName(segment));
  const seasonHit = extractSeason(tokens);
  const consumed = new Set(seasonHit.consumed);
  let season = seasonHit.season > 0 ? seasonHit.season : undefined;
  if (season === undefined) {
    const tvHit = extractTvSeason(tokens, consumed);
    if (tvHit) season = tvHit.season;
  }
  const bag = collectFields(tokens, consumed);
  const titleWords = tokens.filter((token) => token.kind === "title").map((token) => token.value);
  return {
    titleWords,
    season,
    year: bag.year,
    source: bag.source,
    service: bag.service,
    codec: bag.codec,
    resolution: bag.resolution,
    groups: bag.groups,
    langs: bag.langs,
    special: bag.special !== undefined,
  };
}

function mergeDirPart(
  ctx: DirContext,
  part: {
    season?: number;
    year?: number;
    source?: string;
    service?: string;
    codec?: string;
    resolution?: string;
    groups: string[];
    langs: string[];
    special: boolean;
  }
): void {
  if (part.season !== undefined && ctx.season === undefined) ctx.season = part.season;
  if (part.year !== undefined && ctx.year === undefined) ctx.year = part.year;
  if (part.source !== undefined && ctx.source === undefined) ctx.source = part.source;
  if (part.service !== undefined && ctx.service === undefined) ctx.service = part.service;
  if (part.codec !== undefined && ctx.codec === undefined) ctx.codec = part.codec;
  if (part.resolution !== undefined && ctx.resolution === undefined) {
    ctx.resolution = part.resolution;
  }
  if (part.special) ctx.hasSpecial = true;
  for (const group of part.groups) {
    if (!ctx.groups.includes(group)) ctx.groups.push(group);
  }
  for (const lang of part.langs) {
    if (!ctx.langs.includes(lang)) ctx.langs.push(lang);
  }
}

function analyzeDir(segments: string[]): DirContext {
  const ctx: DirContext = {
    titleWords: [],
    groups: [],
    langs: [],
    hasMovieRoot: false,
    hasSpecial: false,
  };
  let bestScore = 0;
  for (const segment of segments) {
    if (ROOT_NAMES.has(segment.toLowerCase())) {
      if (segment.toLowerCase() === "movies") ctx.hasMovieRoot = true;
      continue;
    }
    const part = analyzeSegment(segment);
    mergeDirPart(ctx, part);
    if (part.titleWords.length >= bestScore && part.titleWords.length > 0) {
      bestScore = part.titleWords.length;
      ctx.titleWords = part.titleWords;
    }
  }
  return ctx;
}

function getDirContext(dirRaw: string): DirContext {
  const cached = dirContextCache.get(dirRaw);
  if (cached !== undefined) return cached;
  const ctx = analyzeDir(splitDir(dirRaw));
  dirContextCache.set(dirRaw, ctx);
  return ctx;
}

function resolveSidecar(dirRaw: string, stem: string, ext: string): MediaFileParse {
  const ctx = getDirContext(dirRaw);
  const { base, suffix } = splitSidecarStem(stem);
  const kind = SUBTITLE_EXTS.includes(ext) ? "subs" : "audio";
  const baseParsed = resolveVideo(ctx, dirRaw, base);
  const sidecar = parseSidecarSuffix(suffix, kind, ctx.langs);
  if (!sidecar.studio && suffix === null) {
    const parent = dirRaw.split(/[\\/]/).at(-1) ?? "";
    if (/(sound|subs)/i.test(parent)) {
      const bracket = /\[[^\]]+\]/.exec(parent);
      if (bracket) sidecar.studio = bracket[0].slice(1, -1);
    }
  }
  if (sidecar.lang.length === 0 && baseParsed.lang.length > 0) {
    sidecar.lang = baseParsed.lang;
  }
  return { ...baseParsed, sidecar };
}

export function resolveMediaFile(dir: string | null, file: string): MediaFileParse {
  const { stem, ext } = stripMediaExtension(file);
  const dirRaw = splitDir(dir).join("/");
  if (ext && (SUBTITLE_EXTS.includes(ext) || AUDIO_EXTS.includes(ext))) {
    return resolveSidecar(dirRaw, stem, ext);
  }
  const ctx = getDirContext(dirRaw);
  return resolveVideo(ctx, dirRaw, stem);
}
