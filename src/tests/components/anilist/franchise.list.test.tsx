import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EntryLookup, EntryListInfo } from "@/lib/anilist/entries.utils";
import { FranchiseList } from "@/routes/components/anilist/franchise/list.franchise";
import { patchSettings } from "@/store/settings.store";
import type { FranchiseEdge, FranchiseNode } from "@/types/anilist";

function node(
  id: number,
  title: string,
  year: number,
  episodes: number | null,
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

const nodes = [
  node(1, "First Season", 2015, 12),
  node(2, "Second Season", 2016, 12),
  node(3, "Side Story", 2017, 1),
];
const edges: FranchiseEdge[] = [{ relation_type: "SEQUEL", source: 1, target: 2 }];
const relationMap = new Map([
  [1, "ROOT"],
  [2, "SEQUEL"],
  [3, "SIDE_STORY"],
]);
const lookup: EntryLookup = new Map([
  [1, entry({ list_status: "CURRENT", progress: 6, score: 8 })],
  [2, entry({ list_status: "COMPLETED", progress: 12 })],
]);

function renderList(searchMatchIds: Set<number> | null = null) {
  return render(
    <FranchiseList
      nodes={nodes}
      edges={edges}
      animeId={1}
      entryLookup={lookup}
      relationMap={relationMap}
      mainlineIds={new Set([1, 2])}
      searchMatchIds={searchMatchIds}
      scoreFormat="POINT_10"
      onNodeClick={() => undefined}
    />
  );
}

beforeEach(() => {
  patchSettings({ language: "en" });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("FranchiseList watch order", () => {
  it("summarizes the franchise and numbers the main line", () => {
    renderList();

    expect(screen.getByText("Titles: 3, aired episodes: 25")).toBeDefined();
    expect(screen.getByText("Watched 18 (72%)")).toBeDefined();
    expect(screen.getByText("Main line")).toBeDefined();
    expect(screen.getByText("Side stories")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
  });

  it("marks the current title and the next unwatched one", () => {
    renderList();

    expect(screen.getByText("Current")).toBeDefined();
    expect(screen.getByText("Next")).toBeDefined();
    expect(screen.getByRole("button", { name: "First Season. Watching. 6/12" })).toBeDefined();
    expect(screen.getByText(/My 8\/10/)).toBeDefined();
    expect(screen.getByRole("progressbar", { name: "Watched 6 of 12" })).toBeDefined();
  });

  it("dims non-matching rows and scrolls to the first match", () => {
    renderList(new Set([3]));

    const dimmed = screen.getByRole("button", { name: /First Season/ });
    const matched = screen.getByRole("button", { name: /Side Story/ });
    expect(dimmed.className).toContain("opacity-30");
    expect(matched.className).not.toContain("opacity-30");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("counts aired episodes and marks announced titles", () => {
    const airing = node(1, "Airing", 2026, 12, {
      next_airing_episode: { airing_at: 4_102_444_800, episode: 6 },
      status: "RELEASING",
    });
    const announced = node(2, "Announced", 2027, 12, { status: "NOT_YET_RELEASED" });
    const airingLookup: EntryLookup = new Map([
      [1, entry({ list_status: "CURRENT", progress: 5 })],
    ]);

    render(
      <FranchiseList
        nodes={[airing, announced]}
        edges={[]}
        animeId={1}
        entryLookup={airingLookup}
        relationMap={
          new Map([
            [1, "ROOT"],
            [2, "SEQUEL"],
          ])
        }
        mainlineIds={new Set([1, 2])}
        searchMatchIds={null}
        scoreFormat="POINT_10"
        onNodeClick={() => undefined}
      />
    );

    expect(screen.getByText("Titles: 2, aired episodes: 5")).toBeDefined();
    expect(screen.getByText("Watched 5 (100%)")).toBeDefined();
    expect(screen.getByText("5/5")).toBeDefined();
    expect(screen.getByRole("button", { name: "Announced. Not aired" })).toBeDefined();
    expect(screen.queryByText("Next")).toBeNull();
  });

  it("does not navigate when the current row is clicked", () => {
    const onOpen = vi.fn();
    render(
      <FranchiseList
        nodes={nodes}
        edges={edges}
        animeId={1}
        entryLookup={lookup}
        relationMap={relationMap}
        mainlineIds={new Set([1, 2])}
        searchMatchIds={null}
        scoreFormat="POINT_10"
        onNodeClick={onOpen}
      />
    );
    const current = screen.getByRole("button", { name: "First Season. Watching. 6/12" });
    fireEvent.click(current);
    expect(onOpen).not.toHaveBeenCalled();
    expect(current.className).toContain("cursor-default");
  });

  it("still navigates when a non-current row is clicked", () => {
    const onOpen = vi.fn();
    render(
      <FranchiseList
        nodes={nodes}
        edges={edges}
        animeId={1}
        entryLookup={lookup}
        relationMap={relationMap}
        mainlineIds={new Set([1, 2])}
        searchMatchIds={null}
        scoreFormat="POINT_10"
        onNodeClick={onOpen}
      />
    );
    const nonCurrent = screen.getByRole("button", { name: "Second Season. Completed. 12/12" });
    fireEvent.click(nonCurrent);
    expect(onOpen).toHaveBeenCalledWith(2);
    expect(nonCurrent.className).toContain("cursor-pointer");
  });
});
