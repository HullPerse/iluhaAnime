import { describe, expect, it } from "vitest";

import type { EntryListInfo, EntryLookup } from "@/types/entries";
import {
  availableEpisodes,
  buildFranchiseSections,
  countFranchiseGroups,
  franchiseSummary,
  orderMainline,
  pickNextToWatch,
} from "@/lib/franchise.utils";
import type { FranchiseEdge, FranchiseNode } from "@/types/anilist";

function node(
  id: number,
  title: string,
  year: number | null,
  episodes: number | null = 12,
  overrides: Partial<FranchiseNode> = {}
): FranchiseNode {
  return {
    cover_url: null,
    episodes,
    format: "TV",
    id,
    media_type: "ANIME",
    score: null,
    title,
    year,
    status: null,
    next_airing_episode: null,
    ...overrides,
  };
}

function edge(source: number, target: number, relation_type: string): FranchiseEdge {
  return { relation_type, source, target };
}

function entry(overrides: Partial<EntryListInfo>): EntryListInfo {
  return {
    completed_at: null,
    created_at: null,
    custom_lists: [],
    hidden_from_status_lists: null,
    list_status: "CURRENT",
    notes: null,
    private: null,
    progress: null,
    repeat: null,
    score: null,
    started_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe("orderMainline", () => {
  it("uses prequel and sequel edges before years and titles", () => {
    const nodes = [node(1, "Zeta", 2015), node(2, "Alpha", 2015), node(3, "Season Zero", 2010)];
    const edges = [edge(1, 2, "SEQUEL"), edge(1, 3, "PREQUEL")];

    expect(orderMainline(nodes, edges, new Set([1, 2, 3])).map((item) => item.id)).toEqual([
      3, 1, 2,
    ]);
  });

  it("falls back to year and title when the edges form a cycle", () => {
    const nodes = [node(1, "Same", 2020), node(2, "Same", 2019)];
    const edges = [edge(1, 2, "SEQUEL"), edge(2, 1, "SEQUEL")];

    expect(orderMainline(nodes, edges, new Set([1, 2])).map((item) => item.id)).toEqual([2, 1]);
  });

  it("keeps titles without a year at the end", () => {
    const nodes = [node(1, "No year", null), node(2, "Known", 2018)];

    expect(orderMainline(nodes, [], new Set([1, 2])).map((item) => item.id)).toEqual([2, 1]);
  });
});

describe("buildFranchiseSections", () => {
  it("puts the main line first and groups the leftovers once", () => {
    const nodes = [node(1, "Root", 2015), node(2, "Sequel", 2016), node(3, "Side", 2017)];
    const relationMap = new Map([
      [1, "ROOT"],
      [2, "SEQUEL"],
      [3, "SIDE_STORY"],
    ]);
    const sections = buildFranchiseSections(
      nodes,
      [edge(1, 2, "SEQUEL")],
      new Set([1, 2]),
      relationMap
    );

    expect(sections.map((section) => section.key)).toEqual(["mainline", "SIDE_STORY"]);
    expect(sections[0]?.items.map((item) => item.id)).toEqual([1, 2]);
    expect(sections[1]?.items.map((item) => item.id)).toEqual([3]);
  });
});

describe("countFranchiseGroups", () => {
  it("skips the root and files unknown relations under Other", () => {
    const nodes = [node(1, "Root", 2015), node(2, "Sequel", 2016), node(3, "Mystery", 2017)];
    const counts = countFranchiseGroups(
      nodes,
      new Map([
        [1, "ROOT"],
        [2, "SEQUEL"],
      ]),
      1
    );

    expect(counts.SEQUEL).toBe(1);
    expect(counts.OTHER).toBe(1);
    expect(counts.PREQUEL).toBe(0);
  });
});

const NOW = 1_700_000_000;

describe("availableEpisodes", () => {
  it("counts only the aired episodes of a running season", () => {
    const airing = node(1, "Airing", 2026, 12, {
      next_airing_episode: { airing_at: NOW + 3600, episode: 6 },
      status: "RELEASING",
    });

    expect(availableEpisodes(airing, NOW)).toBe(5);
  });

  it("counts the next episode once its airing time passed", () => {
    const airing = node(1, "Airing", 2026, 12, {
      next_airing_episode: { airing_at: NOW, episode: 6 },
      status: "RELEASING",
    });

    expect(availableEpisodes(airing, NOW)).toBe(6);
  });

  it("keeps announced titles at zero and clamps the aired count to the plan", () => {
    expect(
      availableEpisodes(node(1, "Announced", 2027, 12, { status: "NOT_YET_RELEASED" }), NOW)
    ).toBe(0);

    const overplanned = node(2, "Airing", 2026, 12, {
      next_airing_episode: { airing_at: NOW + 3600, episode: 40 },
      status: "RELEASING",
    });
    expect(availableEpisodes(overplanned, NOW)).toBe(12);
  });

  it("falls back to the planned count for finished and unknown statuses", () => {
    expect(availableEpisodes(node(1, "Finished", 2015, 12, { status: "FINISHED" }), NOW)).toBe(12);
    expect(availableEpisodes(node(2, "Unknown", 2015, 12), NOW)).toBe(12);
    expect(availableEpisodes(node(3, "No count", 2015, null, { status: "FINISHED" }), NOW)).toBe(0);
  });
});

describe("pickNextToWatch", () => {
  const mainline = [node(1, "One", 2015), node(2, "Two", 2016), node(3, "Three", 2017)];

  it("returns the first unfinished title with the next episode", () => {
    const lookup: EntryLookup = new Map([
      [1, entry({ list_status: "COMPLETED", progress: 12 })],
      [2, entry({ list_status: "CURRENT", progress: 4 })],
      [3, entry({ list_status: "COMPLETED", progress: 12 })],
    ]);

    expect(pickNextToWatch(mainline, lookup, NOW)).toEqual({ episode: 5, id: 2 });
  });

  it("treats a finished progress as done even when the status lags", () => {
    const lookup: EntryLookup = new Map([[1, entry({ list_status: "CURRENT", progress: 12 })]]);

    expect(pickNextToWatch(mainline, lookup, NOW)).toEqual({ episode: null, id: 2 });
  });

  it("starts an untouched title at the first episode", () => {
    const lookup: EntryLookup = new Map([[1, entry({ list_status: "PLANNING", progress: null })]]);

    expect(pickNextToWatch(mainline, lookup, NOW)).toEqual({ episode: null, id: 1 });
  });

  it("skips announced titles and caught-up airing seasons", () => {
    const announced = node(1, "Announced", 2027, 12, { status: "NOT_YET_RELEASED" });
    const airing = node(2, "Airing", 2026, 12, {
      next_airing_episode: { airing_at: NOW + 3600, episode: 6 },
      status: "RELEASING",
    });
    const caughtUp: EntryLookup = new Map([[2, entry({ list_status: "CURRENT", progress: 5 })]]);

    expect(pickNextToWatch([announced, airing], caughtUp, NOW)).toBeNull();

    const behind: EntryLookup = new Map([[2, entry({ list_status: "CURRENT", progress: 3 })]]);
    expect(pickNextToWatch([announced, airing], behind, NOW)).toEqual({ episode: 4, id: 2 });
  });

  it("does not suggest an episode before the season starts", () => {
    const premiere = node(1, "Premiere", 2026, 12, {
      next_airing_episode: { airing_at: NOW + 3600, episode: 1 },
      status: "RELEASING",
    });
    const lookup: EntryLookup = new Map([[1, entry({ list_status: "PLANNING", progress: null })]]);

    expect(pickNextToWatch([premiere], lookup, NOW)).toBeNull();
  });

  it("returns no marker without a list or when everything is done", () => {
    expect(pickNextToWatch(mainline, undefined, NOW)).toBeNull();
    const done: EntryLookup = new Map(
      mainline.map((item) => [item.id, entry({ list_status: "COMPLETED", progress: 12 })])
    );
    expect(pickNextToWatch(mainline, done, NOW)).toBeNull();
  });
});

describe("franchiseSummary", () => {
  it("sums known episodes and keeps the watched share inside them", () => {
    const nodes = [
      node(1, "One", 2015, 12),
      node(2, "Two", 2016, 24),
      node(3, "Three", 2017, null),
    ];
    const lookup: EntryLookup = new Map([
      [1, entry({ list_status: "COMPLETED", progress: 12 })],
      [2, entry({ list_status: "CURRENT", progress: 30 })],
      [3, entry({ list_status: "CURRENT", progress: 2 })],
    ]);

    expect(franchiseSummary(nodes, lookup, NOW)).toEqual({
      episodes: 36,
      percent: 100,
      titles: 3,
      watched: 36,
    });
  });

  it("counts a completed title without progress as fully watched", () => {
    const nodes = [node(1, "One", 2015, 10), node(2, "Two", 2016, 10)];
    const lookup: EntryLookup = new Map([[1, entry({ list_status: "COMPLETED", progress: null })]]);

    expect(franchiseSummary(nodes, lookup, NOW)).toEqual({
      episodes: 20,
      percent: 50,
      titles: 2,
      watched: 10,
    });
  });

  it("leaves announced titles out of the released total", () => {
    const nodes = [
      node(1, "Released", 2015, 12),
      node(2, "Announced", 2027, 12, { status: "NOT_YET_RELEASED" }),
    ];

    expect(franchiseSummary(nodes, new Map(), NOW)).toEqual({
      episodes: 12,
      percent: 0,
      titles: 2,
      watched: 0,
    });
  });

  it("counts only aired episodes of a running season", () => {
    const nodes = [
      node(1, "Airing", 2026, 12, {
        next_airing_episode: { airing_at: NOW + 3600, episode: 6 },
        status: "RELEASING",
      }),
    ];
    const lookup: EntryLookup = new Map([[1, entry({ list_status: "COMPLETED", progress: 12 })]]);

    expect(franchiseSummary(nodes, lookup, NOW)).toEqual({
      episodes: 5,
      percent: 100,
      titles: 1,
      watched: 5,
    });
  });

  it("reports no percent when no episode counts are known", () => {
    const nodes = [node(1, "One", 2015, null)];
    const lookup: EntryLookup = new Map([[1, entry({ list_status: "CURRENT", progress: 3 })]]);

    expect(franchiseSummary(nodes, lookup, NOW)).toEqual({
      episodes: 0,
      percent: null,
      titles: 1,
      watched: 0,
    });
  });
});
