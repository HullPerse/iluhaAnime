import { SEARCH_ALIASES } from "@/config/graphics/tokens.config";
import { canonicalLang } from "@/lib/player/mediaClassify.utils";
import { aliasSearchTitle, assembleTitleWords, hasCyrillic } from "@/lib/player/videoTitle.utils";
import type {
  DirContext,
  FieldBag,
  MediaClassifiedToken,
  MediaFileParse,
} from "@/types/player/media";

export function collectAudioLangs(tokens: MediaClassifiedToken[]): string[] {
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

export function videoEpisodePart(
  episode?: number,
  episodeAlt?: number,
  epTitle?: string,
  episodeVersion?: number,
  ofTotal?: number
): Pick<MediaFileParse, "episode"> {
  return {
    episode: {
      ...(episode !== undefined ? { number: episode } : {}),
      ...(episodeAlt !== undefined ? { numberAlt: episodeAlt } : {}),
      ...(episodeVersion !== undefined ? { version: episodeVersion } : {}),
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

export function videoTechPart(
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

export function videoFlagPart(
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

export function finishLeading(ctx: DirContext, hit: LeadingResult): MediaFileParse {
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

export function finishSequel(
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

export function leadingBase(bag: FieldBag): {
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

export function leadingEpisode(
  rest: string,
  part: number | undefined
): { epTitle: string; part?: number } {
  const paren = /\(([^)]*)\)\s*$/.exec(rest);
  if (!paren?.[1]) return { epTitle: rest, part };
  const partMatch = /part\s+(\d+)/i.exec(paren[1]);
  if (!partMatch?.[1]) return { epTitle: rest, part };
  return { epTitle: rest.slice(0, paren.index).trim(), part: Number.parseInt(partMatch[1], 10) };
}
