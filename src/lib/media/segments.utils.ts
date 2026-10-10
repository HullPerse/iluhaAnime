import { KNOWN_ARCS } from "@/config/media/tokens.config";
import { normalizeMediaDashes } from "@/lib/media/tokenize.utils";

export function normForCompare(text: string): string {
  return text.toLowerCase().replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitSegments(stem: string): string[] {
  return normalizeMediaDashes(stem).split(/\s+-\s+/);
}

function cleanHead(segment: string): string {
  return segment.replace(/^\[[^\]]*\]\s*/, "").trim();
}

const TRAILING_TECH_RX = /\s*(?:[[(][^\])]*[\])])+\s*$/;

function stripTrailingTech(segment: string): string {
  return segment.replace(TRAILING_TECH_RX, "").trim();
}

function arcKey(arc: string): string {
  return arc.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function arcNorm(segment: string): string | null {
  const clean = stripTrailingTech(segment);
  const words = clean.split(/\s+/);
  const tail = words.at(-1) ?? "";
  if (!/(^|-)hen$/i.test(tail)) return null;
  if (/-hen$/i.test(tail) && !/^hen$/i.test(tail)) return clean;
  if (words.length < 2) return null;
  const prev = words.at(-2) ?? "";
  return `${words.slice(0, -2).join(" ")} ${prev}-hen`.trim();
}

function canonicalArc(arc: string): string {
  const norm = arc.toLowerCase().replace(/-/g, " ");
  for (const known of KNOWN_ARCS) {
    if (known.toLowerCase().replace(/-/g, " ") === norm) return known;
  }
  return arc;
}

function findSegmentArc(
  segments: string[],
  head: string,
  epish: boolean
): { title: string; arc: string; movieHint: true } | null {
  const middles = epish ? segments.slice(1, -1) : segments.slice(1);
  const henSeg = middles.find((segment) => arcNorm(segment) !== null);
  if (henSeg && head.length > 0) {
    const arc = arcNorm(henSeg);
    if (arc) return { title: head, arc: canonicalArc(arc), movieHint: true };
  }
  return null;
}

// Splits a known arc off the tail of a word list, e.g.
// "Kimetsu no Yaiba Hashira Geiko-hen" becomes title words plus the arc.
// Returns null when no tail matches a known arc, so a plain title stays whole.
export function splitKnownArcTail(
  words: readonly string[],
  knownArcs: readonly string[]
): { head: string[]; arc: string } | null {
  for (let start = 1; start < words.length; start += 1) {
    const key = arcKey(words.slice(start).join(" "));
    if (key.length === 0) return null;
    const known = knownArcs.find((arc) => arcKey(arc) === key);
    if (known !== undefined) return { head: words.slice(0, start), arc: known };
  }
  return null;
}

function joinThreeSegments(
  segments: string[],
  dirNorm: string
): { title: string; prefix?: string; movieHint: true } | null {
  const first = cleanHead(segments.at(0) ?? "");
  const second = (segments.at(1) ?? "").trim();
  const contains = (part: string): boolean => {
    const norm = normForCompare(part.replace(/^\[[^\]]*\]\s*/, ""));
    return norm.length > 0 && dirNorm.includes(norm);
  };
  const firstHit = contains(first);
  const secondHit = contains(second);
  if (firstHit && secondHit && first && second)
    return { title: `${first}: ${second}`, movieHint: true };
  if (!firstHit && secondHit && first && second)
    return { title: second, prefix: first, movieHint: true };
  if (firstHit && !secondHit && first) return { title: first, movieHint: true };
  return null;
}

function joinTwoSegments(
  segments: string[]
): { title: string; arc?: string; movieHint: true } | null {
  const first = cleanHead(segments.at(0) ?? "");
  const second = stripTrailingTech((segments.at(1) ?? "").trim());
  if (!first || !second) return null;
  const arc = arcNorm(second);
  if (arc) return { title: first, arc: canonicalArc(arc), movieHint: true };
  return { title: `${first}: ${second}`, movieHint: true };
}

export function resolveSegments(
  stem: string,
  dirRaw: string,
  fallbackTitle: string
): { title: string; arc?: string; prefix?: string; movieHint?: boolean } {
  const segments = splitSegments(stem).map((segment) => segment.trim());
  if (segments.length < 2) return { title: fallbackTitle };
  const head = cleanHead(segments.at(0) ?? "");
  const last = segments.at(-1) ?? "";
  const epish = /^(\d{1,3}|S\d{1,2}E\d{1,3}|E\d{1,3})/i.test(last);
  const arc = findSegmentArc(segments, head, epish);
  if (arc) return arc;
  if (segments.length === 3) {
    return joinThreeSegments(segments, normForCompare(dirRaw)) ?? { title: fallbackTitle };
  }
  if (segments.length === 2 && !epish) {
    return joinTwoSegments(segments) ?? { title: fallbackTitle };
  }
  return { title: fallbackTitle };
}
