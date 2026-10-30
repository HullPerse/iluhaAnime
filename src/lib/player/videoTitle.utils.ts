import { IGNORE_SUFFIXES } from "@/config/graphics/tokens.config";
import type { MediaClassifiedToken } from "@/types/player/media";

export const ROMAN_SEASON: Record<string, number> = {
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};
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
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.kind === "type" && /gekijouban/i.test(token.value)) {
      words.push(token.value);
      continue;
    }
    if (token.kind === "episode" && !consumed.has(index) && /^\d{1,3}$/.test(token.value)) {
      words.push(token.value);
      continue;
    }
    if (token.kind !== "title" || consumed.has(index)) continue;
    if (IGNORE_SUFFIXES.includes(token.value.toLowerCase())) {
      tags.push(token.value);
      continue;
    }
    const next = tokens.at(index + 1);
    if (token.value.toLowerCase() === "by" && (next?.kind === "group" || next?.kind === "studio")) {
      continue;
    }
    words.push(token.value);
  }
  return words;
}

function seasonOrdinal(season: number): string {
  if (season === 2) return "nd";
  if (season === 3) return "rd";
  return "th";
}

const CYRILLIC_RX = new RegExp(`[${String.fromCodePoint(0x0400)}-${String.fromCodePoint(0x04ff)}]`);

export function hasCyrillic(text: string): boolean {
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
    const tail = params.title.split(/\s+/).at(-1)?.toLowerCase() ?? "";
    const tailSeason =
      ROMAN_SEASON[tail] ?? (/^\d+$/.test(tail) ? Number.parseInt(tail, 10) : undefined);
    if (tailSeason === params.season) return params.title;
    return `${params.title} ${params.season}${seasonOrdinal(params.season)} Season`;
  }
  return params.title;
}

export function extractEpTitle(
  tokens: MediaClassifiedToken[],
  atomIndex: number,
  consumed: Set<number>,
  fallbackIndex: number
): { title?: string; ignored: string[] } {
  if (atomIndex < 0 && fallbackIndex < 0) return { ignored: [] };
  const fallbackToken = tokens.at(fallbackIndex);
  if (!fallbackToken || /^\d{1,3}$/.test(fallbackToken.value)) return { ignored: [] };
  const start = atomIndex >= 0 ? atomIndex : fallbackIndex;
  const words: string[] = [];
  const ignored: string[] = [];
  let end = start + 1;
  for (let index = start + 1; index < tokens.length; index += 1) {
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
  for (let index = start + 1; index < end; index += 1) consumed.add(index);
  return { title: words.join(" "), ignored };
}

export function absorbConsumed(into: Set<number>, from: Set<number>): void {
  for (const index of from) into.add(index);
}

export function absorbStrings(into: string[], from: string[]): void {
  for (const value of from) {
    if (!into.includes(value)) into.push(value);
  }
}
