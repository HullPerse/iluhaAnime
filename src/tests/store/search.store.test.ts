import { describe, expect, it, beforeEach } from "vitest";

import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";

const defaultFilters = {
  codec: "all",
  hasMagnet: false,
  language: "all",
  minSeeders: 0,
  quality: "all",
  sizeMax: 0,
  sizeMin: 0,
};

beforeEach(() => {
  useSearchStore.setState({
    anilistSearchQuery: null,
    crossSearchQuery: null,
    animeIndex: [],
    filters: { ...defaultFilters },
    history: [],
    queryStats: {},
    sortBy: "seeders",
    sortDirection: "desc",
    suggestionStats: {},
  });
});

describe("useSearchStore history", () => {
  it("trims and lowercases added queries", () => {
    useSearchStore.getState().addQuery("  Naruto  ");
    expect(useSearchStore.getState().history).toEqual(["naruto"]);
  });

  it("ignores empty queries", () => {
    useSearchStore.getState().addQuery("   ");
    expect(useSearchStore.getState().history).toEqual([]);
  });

  it("moves an existing query to the front instead of duplicating", () => {
    useSearchStore.getState().addQuery("naruto");
    useSearchStore.getState().addQuery("bleach");
    useSearchStore.getState().addQuery("naruto");
    expect(useSearchStore.getState().history).toEqual(["naruto", "bleach"]);
  });

  it("caps history at the configured maximum", () => {
    useSettingsStore.setState({ searchHistoryMaxItems: 2 });
    useSearchStore.getState().addQuery("a");
    useSearchStore.getState().addQuery("b");
    useSearchStore.getState().addQuery("c");
    expect(useSearchStore.getState().history).toEqual(["c", "b"]);
  });

  it("removes a query", () => {
    useSearchStore.getState().addQuery("naruto");
    useSearchStore.getState().addQuery("bleach");
    useSearchStore.getState().removeQuery("naruto");
    expect(useSearchStore.getState().history).toEqual(["bleach"]);
  });

  it("tracks usage and selected suggestions", () => {
    useSearchStore.getState().addQuery("naruto");
    useSearchStore.getState().recordSuggestion("naruto");
    const state = useSearchStore.getState();
    expect(state.queryStats.naruto.count).toBe(1);
    expect(state.suggestionStats.naruto.selectedCount).toBe(1);
  });

  it("tracks an ignored suggestion without counting it as a query", () => {
    useSearchStore.getState().recordSuggestionIgnored("naruto");
    const stat = useSearchStore.getState().suggestionStats.naruto;
    expect(stat.count).toBe(0);
    expect(stat.ignoredCount).toBe(1);
  });

  it("can reset only the AniList title index", () => {
    useSearchStore.setState({
      animeIndex: [
        {
          aliases: [],
          favourite: false,
          id: 1,
          score: null,
          status: "PLANNING",
          title: "Naruto",
        },
      ],
      animeProfileId: 42,
      history: ["naruto"],
    });
    useSearchStore.getState().resetAnimeSuggestions();
    expect(useSearchStore.getState().animeIndex).toEqual([]);
    expect(useSearchStore.getState().animeProfileId).toBeNull();
    expect(useSearchStore.getState().history).toEqual(["naruto"]);
  });
});

describe("useSearchStore queries and sorting", () => {
  it("stores cross-search and anilist queries", () => {
    useSearchStore.getState().setCrossSearchQuery("naruto");
    useSearchStore.getState().setAnilistSearchQuery("bleach");
    const s = useSearchStore.getState();
    expect(s.crossSearchQuery).toBe("naruto");
    expect(s.anilistSearchQuery).toBe("bleach");
  });

  it("stores sort key and direction", () => {
    useSearchStore.getState().setSortBy("size");
    useSearchStore.getState().setSortDirection("asc");
    const s = useSearchStore.getState();
    expect(s.sortBy).toBe("size");
    expect(s.sortDirection).toBe("asc");
  });
});

describe("useSearchStore filters", () => {
  it("merges partial filter updates", () => {
    useSearchStore.getState().setFilters({ minSeeders: 5, quality: "1080p" });
    const f = useSearchStore.getState().filters;
    expect(f.minSeeders).toBe(5);
    expect(f.quality).toBe("1080p");
    expect(f.codec).toBe("all");
  });

  it("resets filters to defaults", () => {
    useSearchStore.getState().setFilters({ hasMagnet: true, minSeeders: 9 });
    useSearchStore.getState().resetFilters();
    expect(useSearchStore.getState().filters).toEqual(defaultFilters);
  });
});
