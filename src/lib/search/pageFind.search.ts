export interface PageFindMatch {
  node: Text;
  start: number;
  end: number;
}

export interface PageFindCollection {
  matches: PageFindMatch[];
  /** A cap was hit (text nodes or matches); the caller should warn about it. */
  truncated: boolean;
}

export interface PageFindOptions {
  root?: ParentNode;
  maxNodes?: number;
  maxMatches?: number;
  caseSensitive?: boolean;
  wholeWords?: boolean;
}

export const PAGE_FIND_NODE_CAP = 20000;
export const PAGE_FIND_MATCH_CAP = 2000;

export const FIND_MATCH_HIGHLIGHT = "find-match";
export const FIND_CURRENT_HIGHLIGHT = "find-current";

const SKIP_SELECTOR =
  '[data-vim-disabled], [data-page-find-skip], [aria-hidden="true"], script, style, noscript, template';

function isHidden(element: HTMLElement): boolean {
  if (element.hidden) return true;
  if (typeof window === "undefined") return false;
  const style = window.getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden";
}

function collectTextNodes(
  root: ParentNode,
  maxNodes: number
): { nodes: Text[]; truncated: boolean } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node as Text;
      const parent = text.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      if (isHidden(parent)) return NodeFilter.FILTER_REJECT;
      if (!text.data.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  for (let current = walker.nextNode(); current !== null; current = walker.nextNode()) {
    if (nodes.length >= maxNodes) return { nodes, truncated: true };
    nodes.push(current as Text);
  }
  return { nodes, truncated: false };
}

export function searchPageFind(query: string, options: PageFindOptions = {}): PageFindCollection {
  if (typeof document === "undefined" || query.trim().length === 0) {
    return { matches: [], truncated: false };
  }
  const root = options.root ?? document.body;
  const maxNodes = options.maxNodes ?? PAGE_FIND_NODE_CAP;
  const maxMatches = options.maxMatches ?? PAGE_FIND_MATCH_CAP;
  const matchOptions = {
    caseSensitive: options.caseSensitive ?? false,
    wholeWords: options.wholeWords ?? false,
  };
  const { nodes, truncated } = collectTextNodes(root, maxNodes);
  const matches: PageFindMatch[] = [];
  for (const node of nodes) {
    for (const range of matchRangesInNode(node.data, query, matchOptions)) {
      if (matches.length >= maxMatches) return { matches, truncated: true };
      matches.push({ node, start: range.start, end: range.end });
    }
  }
  return { matches, truncated };
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function isWholeWord(text: string, start: number, end: number): boolean {
  const before = start > 0 ? (text[start - 1] ?? "") : "";
  const after = end < text.length ? (text[end] ?? "") : "";
  return !WORD_CHAR.test(before) && !WORD_CHAR.test(after);
}

/**
 * Page find is substring-only by design (Chrome parity): scattered letters
 * never match, so a short query cannot light up unrelated words. The shared
 * fuzzy helper keeps living for suggestion highlighting, but it is not used
 * here anymore.
 */
interface FoldedText {
  text: string;
  map: number[];
}

function foldWithMap(value: string, lower: boolean): FoldedText {
  const chars: string[] = [];
  const map: number[] = [];
  let raw = 0;
  for (const char of value) {
    let folded = char.normalize("NFKD").replaceAll(/\p{Mark}/gu, "");
    if (lower) folded = folded.toLowerCase();
    for (const piece of folded) {
      chars.push(piece);
      map.push(raw);
    }
    raw += char.length;
  }
  return { text: chars.join(""), map };
}

function isAsciiText(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if ((value.codePointAt(i) ?? 128) > 127) return false;
  }
  return true;
}

function toRawRange(
  map: readonly number[],
  textLength: number,
  start: number,
  end: number
): { start: number; end: number } {
  return {
    start: map[start] ?? 0,
    end: end < map.length ? (map[end] ?? textLength) : textLength,
  };
}

/**
 * Every contiguous occurrence in the node, so a repeated word on one line
 * stays reachable. Pure ASCII takes the plain indexOf fast path; otherwise
 * both sides fold (diacritics stripped, case per toggle) and folded offsets
 * map back to raw ones, so `pokemon` still finds `Pokémon` with exact
 * highlight spans. Whole-word mode filters the final spans by word
 * boundaries.
 */
function matchRangesInNode(
  text: string,
  query: string,
  options: { caseSensitive: boolean; wholeWords: boolean }
): Array<{ start: number; end: number }> {
  const lower = !options.caseSensitive;
  if (isAsciiText(text) && isAsciiText(query)) {
    const haystack = lower ? text.toLowerCase() : text;
    const needle = lower ? query.toLowerCase() : query;
    const found: Array<{ start: number; end: number }> = [];
    if (needle) {
      let from = 0;
      while (from + needle.length <= haystack.length) {
        const at = haystack.indexOf(needle, from);
        if (at === -1) break;
        found.push({ start: at, end: at + needle.length });
        from = at + needle.length;
      }
    }
    if (!options.wholeWords) return found;
    return found.filter((range) => isWholeWord(text, range.start, range.end));
  }
  const haystack = foldWithMap(text, lower);
  const needle = foldWithMap(query, lower).text;
  const found: Array<{ start: number; end: number }> = [];
  if (needle) {
    let from = 0;
    while (from + needle.length <= haystack.text.length) {
      const at = haystack.text.indexOf(needle, from);
      if (at === -1) break;
      found.push(toRawRange(haystack.map, text.length, at, at + needle.length));
      from = at + needle.length;
    }
  }
  if (!options.wholeWords) return found;
  return found.filter((range) => isWholeWord(text, range.start, range.end));
}

export function stepPageFindIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  return (((current + delta) % length) + length) % length;
}

interface HighlightRegistryLike {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => boolean;
}

type HighlightCtor = new (...ranges: Range[]) => unknown;

function highlightRegistry(): HighlightRegistryLike | null {
  const scope = globalThis as { CSS?: { highlights?: HighlightRegistryLike } };
  return scope.CSS?.highlights ?? null;
}

function highlightCtor(): HighlightCtor | null {
  const scope = globalThis as { Highlight?: HighlightCtor };
  return scope.Highlight ?? null;
}

/** CSS Custom Highlight API is optional; absence degrades to count + navigation. */
export function isPageFindHighlightSupported(): boolean {
  return highlightRegistry() !== null && highlightCtor() !== null;
}

function toRange(match: PageFindMatch): Range | null {
  if (!match.node.isConnected) return null;
  const range = document.createRange();
  try {
    range.setStart(match.node, match.start);
    range.setEnd(match.node, match.end);
  } catch {
    return null;
  }
  return range;
}

export function applyPageFindHighlights(matches: readonly PageFindMatch[], current: number): void {
  const registry = highlightRegistry();
  const Ctor = highlightCtor();
  if (!registry || !Ctor) return;
  registry.delete(FIND_MATCH_HIGHLIGHT);
  registry.delete(FIND_CURRENT_HIGHLIGHT);
  const others: Range[] = [];
  const currentRange: Range[] = [];
  matches.forEach((match, index) => {
    const range = toRange(match);
    if (!range) return;
    if (index === current) currentRange.push(range);
    else others.push(range);
  });
  if (others.length > 0) registry.set(FIND_MATCH_HIGHLIGHT, new Ctor(...others));
  if (currentRange.length > 0) registry.set(FIND_CURRENT_HIGHLIGHT, new Ctor(...currentRange));
}

export function clearPageFindHighlights(): void {
  const registry = highlightRegistry();
  if (!registry) return;
  registry.delete(FIND_MATCH_HIGHLIGHT);
  registry.delete(FIND_CURRENT_HIGHLIGHT);
}

export function scrollMatchIntoView(match: PageFindMatch | undefined): void {
  if (!match || typeof window === "undefined") return;
  match.node.parentElement?.scrollIntoView({ block: "center" });
}
