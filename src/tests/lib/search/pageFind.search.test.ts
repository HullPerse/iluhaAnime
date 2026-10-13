import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPageFindHighlights,
  clearPageFindHighlights,
  FIND_CURRENT_HIGHLIGHT,
  FIND_MATCH_HIGHLIGHT,
  isPageFindHighlightSupported,
  scrollMatchIntoView,
  searchPageFind,
  stepPageFindIndex,
} from "@/lib/search/pageFind.search";

const nodes: HTMLElement[] = [];

function container(...texts: string[]): HTMLElement {
  const root = document.createElement("div");
  for (const text of texts) {
    const span = document.createElement("span");
    span.textContent = text;
    root.append(span);
  }
  document.body.append(root);
  nodes.push(root);
  return root;
}

const originalCSS = (globalThis as { CSS?: unknown }).CSS;
const originalHighlight = (globalThis as { Highlight?: unknown }).Highlight;

afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
  (globalThis as { CSS?: unknown }).CSS = originalCSS;
  (globalThis as { Highlight?: unknown }).Highlight = originalHighlight;
  vi.restoreAllMocks();
});

describe("searchPageFind", () => {
  it("returns nothing for an empty query", () => {
    container("hello");
    expect(searchPageFind("   ")).toEqual({ matches: [], truncated: false });
  });

  it("collects matches across text nodes case-insensitively", () => {
    const root = container("Alpha beta", "beta gamma");
    const { matches } = searchPageFind("BETA", { root });
    expect(matches).toHaveLength(2);
    expect(matches.map((match) => match.node.data)).toEqual(["Alpha beta", "beta gamma"]);
  });

  it("reports text coordinates of the match", () => {
    const root = container("findme");
    const { matches } = searchPageFind("dme", { root });
    expect(matches[0]?.start).toBe(3);
    expect(matches[0]?.end).toBe(6);
  });

  it("skips hidden and opted-out subtrees", () => {
    const root = container("visible");
    const hidden = document.createElement("span");
    hidden.textContent = "hidden";
    hidden.hidden = true;
    const skipped = document.createElement("span");
    skipped.textContent = "skipped";
    skipped.dataset.pageFindSkip = "";
    const ariaHidden = document.createElement("span");
    ariaHidden.textContent = "decorative";
    ariaHidden.setAttribute("aria-hidden", "true");
    root.append(hidden, skipped, ariaHidden);
    const { matches } = searchPageFind("den", { root });
    expect(matches).toHaveLength(0);
  });

  it("returns nothing for a query that cannot match", () => {
    const root = container("alpha");
    expect(searchPageFind("zzz", { root }).matches).toEqual([]);
  });

  it("flags the node cap", () => {
    const root = container("one", "two", "three");
    const { truncated } = searchPageFind("t", { root, maxNodes: 1 });
    expect(truncated).toBe(true);
  });

  it("flags the match cap", () => {
    const root = container("a", "a", "a");
    const { matches, truncated } = searchPageFind("a", { root, maxMatches: 2 });
    expect(matches).toHaveLength(2);
    expect(truncated).toBe(true);
  });
});

describe("stepPageFindIndex", () => {
  it("wraps in both directions", () => {
    expect(stepPageFindIndex(-1, 1, 3)).toBe(0);
    expect(stepPageFindIndex(2, 1, 3)).toBe(0);
    expect(stepPageFindIndex(0, -1, 3)).toBe(2);
  });

  it("returns -1 without matches", () => {
    expect(stepPageFindIndex(0, 1, 0)).toBe(-1);
  });
});

describe("page find highlights", () => {
  it("is unavailable without the Custom Highlight API", () => {
    (globalThis as { CSS?: unknown }).CSS = {};
    (globalThis as { Highlight?: unknown }).Highlight = undefined;
    expect(isPageFindHighlightSupported()).toBe(false);
    const root = container("alpha");
    const { matches } = searchPageFind("alpha", { root });
    expect(() => applyPageFindHighlights(matches, 0)).not.toThrow();
    expect(() => clearPageFindHighlights()).not.toThrow();
  });

  it("registers the other matches and the current one separately", () => {
    const set = vi.fn();
    const remove = vi.fn();
    (globalThis as { CSS?: unknown }).CSS = { highlights: { set, delete: remove } };
    class FakeHighlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    (globalThis as { Highlight?: unknown }).Highlight = FakeHighlight;
    const root = container("alpha", "alpha beta");
    const { matches } = searchPageFind("alpha", { root });
    expect(matches.length).toBe(2);

    applyPageFindHighlights(matches, 1);
    const currentCall = set.mock.calls.find(([name]) => name === FIND_CURRENT_HIGHLIGHT);
    const otherCall = set.mock.calls.find(([name]) => name === FIND_MATCH_HIGHLIGHT);
    expect(currentCall?.[1]).toBeInstanceOf(FakeHighlight);
    expect(otherCall?.[1]).toBeInstanceOf(FakeHighlight);
  });

  it("scrolls the parent element of a match into view", () => {
    const root = container("alpha");
    const { matches } = searchPageFind("alpha", { root });
    const parent = matches[0]?.node.parentElement;
    const scroll = vi.fn();
    if (parent) parent.scrollIntoView = scroll;
    scrollMatchIntoView(matches[0]);
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
  });
});
