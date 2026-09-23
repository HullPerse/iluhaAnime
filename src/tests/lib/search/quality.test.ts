import { describe, expect, it } from "vitest";

import { getSearchSuggestions } from "@/lib/search/suggestions.utils";
import type { SearchAnimeSuggestion } from "@/types/search";

const INDEX: SearchAnimeSuggestion[] = [
  {
    aliases: ["Sousou no Frieren"],
    favourite: true,
    id: 1,
    score: 95,
    status: "COMPLETED",
    title: "Frieren: Beyond Journey's End",
  },
  {
    aliases: [],
    favourite: false,
    id: 2,
    score: 0,
    status: "PLANNING",
    title: "Fruits Basket",
  },
  {
    aliases: ["Shingeki no Kyojin"],
    favourite: false,
    id: 3,
    score: 87,
    status: "FINISHED",
    title: "Attack on Titan",
  },
];

function top(query: string, extra: Record<string, unknown> = {}): string | undefined {
  return getSearchSuggestions(query, { animeIndex: INDEX, limit: 5, ...extra })[0]?.value;
}

describe("search quality oracle", () => {
  it("never echoes the exact query (scorer contract)", () => {
    expect(top("frieren: beyond journey's end")).toBeUndefined();
    expect(top("attack on titan")).toBeUndefined();
  });

  it("resolves prefixes to the best title", () => {
    expect(top("frie")).toBe("Frieren: Beyond Journey's End");
    expect(top("attack")).toBe("Attack on Titan");
  });

  it("resolves aliases", () => {
    expect(top("sousou no frieren")).toBe("Frieren: Beyond Journey's End");
    expect(top("shingeki")).toBe("Attack on Titan");
  });

  it("resolves typos through the spelling fallback", () => {
    expect(top("friren")).toBe("Frieren: Beyond Journey's End");
  });

  it("prefers history matches learned by selection", () => {
    const value = getSearchSuggestions("frieren 108", {
      animeIndex: INDEX,
      history: ["frieren 1080p"],
      limit: 5,
    })[0]?.value;
    expect(value).toBe("frieren 1080p");
  });

  it("keeps collection titles above plain history", () => {
    const value = getSearchSuggestions("nar", {
      animeIndex: [],
      collectionItems: [{ title: "Naruto", altTitles: [] }],
      history: ["naruto shippuden filler"],
      limit: 5,
    })[0]?.value;
    expect(value).toBe("Naruto");
  });

  it("returns nothing for empty queries and honors the limit", () => {
    expect(getSearchSuggestions("   ", { animeIndex: INDEX })).toEqual([]);
    expect(getSearchSuggestions("f", { animeIndex: INDEX, limit: 1 }).length).toBeLessThanOrEqual(
      1
    );
  });
});
