import { findSubsequenceRanges } from "@/lib/highlight/highlight.utils";

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
  const { nodes, truncated } = collectTextNodes(root, maxNodes);
  const matches: PageFindMatch[] = [];
  for (const node of nodes) {
    for (const range of findSubsequenceRanges(node.data, query)) {
      if (matches.length >= maxMatches) return { matches, truncated: true };
      matches.push({ node, start: range.start, end: range.end });
    }
  }
  return { matches, truncated };
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
