import * as z from "zod/mini";

import data from "./tokens.data.json";

const TokensDataSchema = z.object({
  AUDIO_EXTS: z.array(z.string()),
  AUDIO_TERMS: z.array(z.string()),
  EDITION_TAGS: z.array(z.string()),
  IGNORE_SUFFIXES: z.array(z.string()),
  KNOWN_ARCS: z.array(z.string()),
  LANG_ALIASES: z.record(z.string(), z.string()),
  LANGS: z.array(z.string()),
  RELEASE_GROUPS: z.array(z.string()),
  SEARCH_ALIASES: z.array(z.array(z.string())),
  SERVICE_ALIASES: z.record(z.string(), z.string()),
  SOURCES: z.array(z.string()),
  STREAM_SERVICES: z.array(z.string()),
  SUBTITLE_EXTS: z.array(z.string()),
  SUB_FORMATS: z.array(z.string()),
  SUB_VARIANTS: z.array(z.string()),
  TRACK_STUDIOS: z.array(z.string()),
  TYPE_MARKERS: z.array(z.string()),
  VIDEO_CODECS: z.array(z.string()),
  VIDEO_EXTS: z.array(z.string()),
});

const parsed = TokensDataSchema.parse(data);

export const RELEASE_GROUPS = parsed.RELEASE_GROUPS as readonly string[];
export const TRACK_STUDIOS = parsed.TRACK_STUDIOS as readonly string[];
export const STREAM_SERVICES = parsed.STREAM_SERVICES as readonly string[];
export const SERVICE_ALIASES = parsed.SERVICE_ALIASES as Readonly<Record<string, string>>;
export const SOURCES = parsed.SOURCES as readonly string[];
export const VIDEO_CODECS = parsed.VIDEO_CODECS as readonly string[];
export const AUDIO_TERMS = parsed.AUDIO_TERMS as readonly string[];
export const LANGS = parsed.LANGS as readonly string[];
export const LANG_ALIASES = parsed.LANG_ALIASES as Readonly<Record<string, string>>;
export const SUB_FORMATS = parsed.SUB_FORMATS as readonly string[];
export const SUB_VARIANTS = parsed.SUB_VARIANTS as readonly string[];
export const EDITION_TAGS = parsed.EDITION_TAGS as readonly string[];
export const DUB_MARKERS = ["DUB", "MVO", "VO"] as const;
export const TYPE_MARKERS = parsed.TYPE_MARKERS as readonly string[];
export const IGNORE_SUFFIXES = parsed.IGNORE_SUFFIXES as readonly string[];
export const VIDEO_EXTS = parsed.VIDEO_EXTS as readonly string[];
export const SUBTITLE_EXTS = parsed.SUBTITLE_EXTS as readonly string[];
export const AUDIO_EXTS = parsed.AUDIO_EXTS as readonly string[];
export const SEARCH_ALIASES = parsed.SEARCH_ALIASES as unknown as ReadonlyArray<readonly [string, string]>;
export const KNOWN_ARCS = parsed.KNOWN_ARCS as readonly string[];
export const KNOWN_ARC_MAP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const arc of KNOWN_ARCS) {
    map.set(arc.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim(), arc);
  }
  return map;
})();
export const SEASON_EPISODE_RX = /S(\d{1,2})E(\d{1,3})/i;
export const OF_TOTAL_RX = /(\d{1,3})_of_(\d{1,3})/i;
export const LEADING_NUMBER_RX = /^(\d{1,3})\.\s*(.+)$/;
export const CRC32_RX = /\[([0-9A-Fa-f]{8})\]/;