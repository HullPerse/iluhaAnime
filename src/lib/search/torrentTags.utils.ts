import type { SearchFilters, Source } from "@/types/search";

import { parseSize } from "./format.utils";

export type TorrentTagKey = "quality" | "codec" | "lang" | "seeds" | "size" | "source";

export interface TorrentTag {
  key: TorrentTagKey;
  op: string;
  value: string;
  raw: string;
  start: number;
  end: number;
}

export interface ParsedTorrentTags {
  cleanQuery: string;
  tags: TorrentTag[];
}

const QUALITIES: Record<string, string> = {
  "2160p": "2160p",
  "4k": "2160p",
  "1080p": "1080p",
  "720p": "720p",
  "480p": "480p",
};

const CODECS: Record<string, string> = {
  hevc: "HEVC",
  x264: "x264",
  x265: "x265",
  av1: "AV1",
};

const LANGS = new Set([
  "ru",
  "en",
  "multi",
  "dual",
  "ar",
  "zh",
  "de",
  "fr",
  "jp",
  "ko",
  "pt",
  "es",
  "th",
  "vi",
]);

const SOURCES = new Set(["erai-raws", "rutracker", "nyaa", "nekobt", "sukebei"]);

const TOKEN_RE = /(\S+?)(>=|<=|!=|=|>|<)(\S+)/;

function parseSeeds(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const num = Number(value);
  return num >= 0 ? num : undefined;
}

function parseSizeMb(value: string): number | undefined {
  const bytes = parseSize(value);
  if (!bytes || bytes <= 0) return undefined;
  return bytes / 1_048_576;
}

const TAG_VALIDATORS: Record<string, (op: string, value: string) => boolean> = {
  quality: (op, value) => op === "=" && QUALITIES[value.toLowerCase()] !== undefined,
  codec: (op, value) => op === "=" && CODECS[value.toLowerCase()] !== undefined,
  lang: (op, value) => op === "=" && LANGS.has(value.toLowerCase()),
  seeds: (op, value) =>
    (op === ">=" || op === ">" || op === "=") && parseSeeds(value) !== undefined,
  size: (op, value) => op !== "!=" && parseSizeMb(value) !== undefined,
  source: (op, value) => op === "=" && SOURCES.has(value.toLowerCase()),
};

function validTag(key: string, op: string, value: string): TorrentTagKey | null {
  const validate = TAG_VALIDATORS[key];
  if (!validate || !validate(op, value)) return null;
  return key as TorrentTagKey;
}

export function normalizeTagValue(tag: TorrentTag): string {
  if (tag.key === "quality") return QUALITIES[tag.value.toLowerCase()] ?? tag.value;
  if (tag.key === "codec") return CODECS[tag.value.toLowerCase()] ?? tag.value;
  if (tag.key === "lang") return tag.value.toLowerCase();
  if (tag.key === "source") return tag.value.toLowerCase();
  return tag.value;
}

export function torrentTagsToFilters(tags: TorrentTag[]): {
  filters: Partial<SearchFilters>;
  source: Source | null;
} {
  const filters: Partial<SearchFilters> = {};
  let source: Source | null = null;
  for (const tag of tags) {
    const value = normalizeTagValue(tag);
    switch (tag.key) {
      case "quality": {
        filters.quality = value;
        break;
      }
      case "codec": {
        filters.codec = value;
        break;
      }
      case "lang": {
        filters.language = value;
        break;
      }
      case "seeds": {
        const num = parseSeeds(value) ?? 0;
        filters.minSeeders = tag.op === ">" ? num + 1 : num;
        break;
      }
      case "size": {
        const mb = parseSizeMb(value) ?? 0;
        if (tag.op === "<" || tag.op === "<=") filters.sizeMax = mb;
        else if (tag.op === ">" || tag.op === ">=") filters.sizeMin = mb;
        else {
          filters.sizeMin = mb;
          filters.sizeMax = mb;
        }
        break;
      }
      case "source": {
        source = value as Source;
        break;
      }
    }
  }
  return { filters, source };
}

export function parseTorrentTags(query: string): ParsedTorrentTags {
  const tags: TorrentTag[] = [];
  const kept: string[] = [];
  const tokenRe = /"[^"]*"|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(query)) !== null) {
    const raw = match[0];
    const tokenMatch = TOKEN_RE.exec(raw);
    if (tokenMatch) {
      const [, keyRaw, op, valueRaw] = tokenMatch;
      const value =
        valueRaw.startsWith('"') && valueRaw.endsWith('"') ? valueRaw.slice(1, -1) : valueRaw;
      const key = validTag(keyRaw.toLowerCase(), op, value);
      if (key && value) {
        tags.push({
          key,
          op,
          value,
          raw,
          start: match.index,
          end: match.index + raw.length,
        });
        continue;
      }
    }
    kept.push(raw);
  }
  return { cleanQuery: kept.join(" ").trim(), tags };
}
