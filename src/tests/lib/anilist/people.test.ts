import { describe, expect, it } from "vitest";

import {
  diffFavPeople,
  favPersonKey,
  favPersonRefFromKey,
  isLastFavPage,
  unionFavAnimeIds,
} from "@/lib/anilist/people.utils";
import type { CachedFavPerson, FavouritePerson } from "@/types/anilist";

function person(id: number): FavouritePerson {
  return { id, image: null, name: `Person ${id}` };
}

function cached(
  kind: "staff" | "character",
  id: number,
  animeIds: number[],
  updatedAt: number
): [string, CachedFavPerson] {
  return [favPersonKey(kind, id), { animeIds, kind, updatedAt }];
}

describe("favPersonKey", () => {
  it("namespaces staff and character ids separately", () => {
    expect(favPersonKey("staff", 7)).toBe("staff:7");
    expect(favPersonKey("character", 7)).toBe("character:7");
  });
});

describe("unionFavAnimeIds", () => {
  it("unions ids across people without duplicates", () => {
    const people = Object.fromEntries([
      cached("staff", 1, [10, 20], 0),
      cached("character", 2, [20, 30], 0),
    ]);
    expect(unionFavAnimeIds(people)).toEqual([10, 20, 30]);
  });

  it("returns an empty list for an empty index", () => {
    expect(unionFavAnimeIds({})).toEqual([]);
  });
});

describe("isLastFavPage", () => {
  it("treats a short page as the last one", () => {
    expect(isLastFavPage(49)).toBe(true);
    expect(isLastFavPage(0)).toBe(true);
  });

  it("treats a full page as a signal to continue", () => {
    expect(isLastFavPage(50)).toBe(false);
  });
});

describe("diffFavPeople", () => {
  const now = 1_000_000;

  it("fetches people missing from the cache", () => {
    const diff = diffFavPeople({}, [person(1)], [person(2)], now);
    expect(diff.fetch).toEqual([
      { id: 1, kind: "staff" },
      { id: 2, kind: "character" },
    ]);
    expect(diff.drop).toEqual([]);
  });

  it("skips fresh entries and refetches stale ones", () => {
    const cachedPeople = Object.fromEntries([
      cached("staff", 1, [10], now - 1_000),
      cached("staff", 2, [20], now - 25 * 60 * 60 * 1000),
    ]);
    const diff = diffFavPeople(cachedPeople, [person(1), person(2)], [], now);
    expect(diff.fetch).toEqual([{ id: 2, kind: "staff" }]);
    expect(diff.drop).toEqual([]);
  });

  it("drops cached people that are no longer favourites", () => {
    const cachedPeople = Object.fromEntries([cached("staff", 9, [90], now)]);
    const diff = diffFavPeople(cachedPeople, [person(1)], [], now);
    expect(diff.fetch).toEqual([{ id: 1, kind: "staff" }]);
    expect(diff.drop).toEqual(["staff:9"]);
  });

  it("respects a custom ttl", () => {
    const cachedPeople = Object.fromEntries([cached("staff", 1, [10], now - 5_000)]);
    expect(diffFavPeople(cachedPeople, [person(1)], [], now, 10_000).fetch).toEqual([]);
    expect(diffFavPeople(cachedPeople, [person(1)], [], now, 1_000).fetch).toEqual([
      { id: 1, kind: "staff" },
    ]);
  });
});

describe("favPersonRefFromKey", () => {
  it("parses staff and character keys", () => {
    expect(favPersonRefFromKey("staff:7")).toEqual({ id: 7, kind: "staff" });
    expect(favPersonRefFromKey("character:9")).toEqual({ id: 9, kind: "character" });
  });

  it("rejects malformed keys", () => {
    expect(favPersonRefFromKey("staff")).toBeNull();
    expect(favPersonRefFromKey("manga:7")).toBeNull();
    expect(favPersonRefFromKey("staff:0")).toBeNull();
    expect(favPersonRefFromKey("staff:-4")).toBeNull();
    expect(favPersonRefFromKey("staff:abc")).toBeNull();
  });
});
