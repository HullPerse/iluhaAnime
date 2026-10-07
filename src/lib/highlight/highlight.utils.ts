import type { HighlightRange } from "@/types/search";

function isAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if ((value.codePointAt(i) ?? 128) > 127) return false;
  }
  return true;
}

const KIND_PRIORITY: Record<string, number> = {
  "spell-error": 3,
  "spell-warn": 2,
  match: 1,
};

const NORMALIZE_CACHE_MAX = 64;
const normalizeCache = new Map<string, string>();

export function normalizeText(value: string): string {
  const cached = normalizeCache.get(value);
  if (cached !== undefined) return cached;
  const normalized = isAscii(value)
    ? value.toLowerCase()
    : value
        .normalize("NFKD")
        .replace(/\p{Mark}/gu, "")
        .toLocaleLowerCase();
  if (normalizeCache.size >= NORMALIZE_CACHE_MAX) {
    const oldest = normalizeCache.keys().next();
    if (!oldest.done) normalizeCache.delete(oldest.value);
  }
  normalizeCache.set(value, normalized);
  return normalized;
}

function findAsciiRanges(value: string, queryNorm: string): HighlightRange[] {
  const lower = value.toLowerCase();
  if (queryNorm.length > lower.length) return [];
  const direct = lower.indexOf(queryNorm);
  if (direct !== -1) return [{ start: direct, end: direct + queryNorm.length }];
  const ranges: HighlightRange[] = [];
  let queryIndex = 0;
  let start = -1;
  for (let index = 0; index < lower.length; index++) {
    if (queryIndex < queryNorm.length && lower[index] === queryNorm[queryIndex]) {
      if (start === -1) start = index;
      queryIndex += 1;
    } else if (start !== -1) {
      ranges.push({ start, end: index });
      start = -1;
    }
  }
  if (start !== -1) ranges.push({ start, end: lower.length });
  return ranges;
}

function matchKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase();
}

function findGeneralRanges(value: string, queryNorm: string): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  let queryIndex = 0;
  let start = -1;
  for (let index = 0; index < value.length; index++) {
    if (queryIndex < queryNorm.length && matchKey(value[index]) === queryNorm[queryIndex]) {
      if (start === -1) start = index;
      queryIndex += 1;
    } else if (start !== -1) {
      ranges.push({ start, end: index });
      start = -1;
    }
  }
  if (start !== -1) ranges.push({ start, end: value.length });
  return ranges;
}

export function findSubsequenceRanges(value: string, query: string): HighlightRange[] {
  const queryNorm = normalizeText(query);
  if (!queryNorm) return [];
  if (isAscii(value)) return findAsciiRanges(value, queryNorm);
  return findGeneralRanges(value, queryNorm);
}

type ClippedRange = { kind: HighlightRange["kind"]; start: number; end: number; rank: number };

function sweepOverlaps(clipped: ClippedRange[]): HighlightRange[] {
  const points: number[] = [];
  for (const r of clipped) {
    points.push(r.start, r.end);
  }
  points.sort((a, b) => a - b);
  const merged: HighlightRange[] = [];
  let prev = -1;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (point === prev) {
      prev = point;
      continue;
    }
    prev = point;
    if (i === points.length - 1) break;
    const start = point;
    const end = points[i + 1];
    if (start === end) continue;
    let winner: ClippedRange | null = null;
    for (const range of clipped) {
      if (range.start <= start && range.end >= end) {
        if (!winner || range.rank > winner.rank) winner = range;
      }
    }
    if (!winner) continue;
    const last = merged.at(-1);
    if (last && last.end === start && last.kind === winner.kind) last.end = end;
    else merged.push({ kind: winner.kind, start, end });
  }
  return merged;
}

export function mergeRanges(
  ranges: readonly HighlightRange[],
  valueLength: number,
  priority: Record<string, number> = KIND_PRIORITY
): HighlightRange[] {
  const rank = (kind: HighlightRange["kind"]): number =>
    priority[kind ?? "match"] ?? 0;
  const clipped: ClippedRange[] = [];
  let sorted = true;
  for (const r of ranges) {
    if (r.start >= r.end || r.start >= valueLength) continue;
    const start = r.start < 0 ? 0 : r.start;
    const end = r.end > valueLength ? valueLength : r.end;
    const prev = clipped.at(-1);
    if (prev && start < prev.start) sorted = false;
    clipped.push({ kind: r.kind, start, end, rank: rank(r.kind) });
  }
  if (clipped.length === 0) return [];
  if (!sorted) clipped.sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];
  let overlap = false;
  for (const range of clipped) {
    const last = merged.at(-1);
    if (last && range.start < last.end) {
      overlap = true;
      break;
    }
    if (last && range.start === last.end && last.kind === range.kind) last.end = range.end;
    else merged.push({ kind: range.kind, start: range.start, end: range.end });
  }
  if (!overlap) return merged;
  if (clipped.length === 2) return resolvePair(clipped[0], clipped[1]);
  return sweepOverlaps(clipped);
}

function resolvePair(first: ClippedRange, second: ClippedRange): HighlightRange[] {
  const [a, b] = first.start <= second.start ? [first, second] : [second, first];
  const out: HighlightRange[] = [];
  const push = (kind: HighlightRange["kind"], start: number, end: number): void => {
    if (start >= end) return;
    const last = out.at(-1);
    if (last && last.end === start && last.kind === kind) last.end = end;
    else out.push({ kind, start, end });
  };
  push(a.kind, a.start, b.start);
  const mid = a.rank >= b.rank ? a : b;
  const midEnd = Math.min(a.end, b.end);
  push(mid.kind, b.start, midEnd);
  if (a.end > b.end) push(a.kind, b.end, a.end);
  else if (b.end > a.end) push(b.kind, a.end, b.end);
  return out;
}

export interface HighlightToken {
  text: string;
  highlighted: boolean;
  kind?: HighlightRange["kind"];
}

export function splitByRanges(
  value: string,
  ranges: readonly HighlightRange[]
): HighlightToken[] {
  const merged = mergeRanges(ranges, value.length);
  const tokens: HighlightToken[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      tokens.push({ text: value.slice(cursor, range.start), highlighted: false });
    }
    tokens.push({ text: value.slice(range.start, range.end), highlighted: true, kind: range.kind });
    cursor = range.end;
  }
  if (cursor < value.length) tokens.push({ text: value.slice(cursor), highlighted: false });
  return tokens;
}

export function fromFuseIndices(indices: ReadonlyArray<readonly [number, number]>): HighlightRange[] {
  return indices
    .filter(([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start <= end && start >= 0)
    .map(([start, end]) => ({ start, end: end + 1 }));
}
