import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useSyncFavPeopleAnimeIds } from "@/hooks/anilist/people.hook";
import { useSearchStore } from "@/store/search.store";
import type { FavPeopleIndexCache, FavouritePerson } from "@/types/anilist";

function person(id: number): FavouritePerson {
  return { id, image: null, name: `Person ${id}` };
}

function mediaPage(key: string, animeIds: number[]) {
  return { anime_ids: animeIds, key };
}

function cacheRecord(cache: FavPeopleIndexCache) {
  return {
    expiresAt: null,
    key: "index:5",
    namespace: "fav_people",
    payload: JSON.stringify(cache),
    updatedAt: Date.now(),
  };
}

function putPayloads(): FavPeopleIndexCache[] {
  return invokeMock.mock.calls
    .filter(([command]) => command === "put_app_cache")
    .map(([, args]) => JSON.parse((args as { payload: string }).payload) as FavPeopleIndexCache);
}

const STAFF = [person(7)];
const CHARACTERS = [person(9)];
const USER = { avatar: null, id: 5, name: "Tester" };

beforeEach(() => {
  invokeMock.mockReset();
  useSearchStore.getState().setFavPeopleAnimeIds([]);
});

describe("useSyncFavPeopleAnimeIds", () => {
  it("fetches every page in batched rounds and publishes the union", async () => {
    const pageOne = Array.from({ length: 50 }, (_, index) => 1000 + index);
    invokeMock.mockImplementation((command: string, args?: { page?: number }) => {
      if (command === "get_app_cache") return Promise.resolve(null);
      if (command === "get_fav_people_media") {
        if (args?.page === 1) {
          return Promise.resolve([
            mediaPage("staff:7", pageOne),
            mediaPage("character:9", [3001, 3002]),
          ]);
        }
        return Promise.resolve([mediaPage("staff:7", [2001, 2002, 2003])]);
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useSyncFavPeopleAnimeIds(USER, STAFF, CHARACTERS, true));

    await waitFor(() => {
      expect(useSearchStore.getState().favPeopleAnimeIds).toContain(2003);
    });
    const ids = useSearchStore.getState().favPeopleAnimeIds;
    expect(ids).toHaveLength(55);
    expect(ids).toContain(3001);
    const rounds = invokeMock.mock.calls
      .filter(([command]) => command === "get_fav_people_media")
      .map(([, args]) => args as { character_ids: number[]; page: number; staff_ids: number[] });
    expect(rounds.map((round) => round.page)).toEqual([1, 2]);
    expect(rounds[1]).toMatchObject({ character_ids: [], staff_ids: [7] });
    const saved = putPayloads().at(-1);
    expect(Object.keys(saved?.people ?? {}).sort()).toEqual(["character:9", "staff:7"]);
  });

  it("replaces stale entries instead of appending to them", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") {
        return Promise.resolve(
          cacheRecord({
            people: {
              "staff:7": { animeIds: [1001], kind: "staff", updatedAt: 0 },
            },
            version: 1,
          })
        );
      }
      if (command === "get_fav_people_media") {
        return Promise.resolve([{ anime_ids: [2001], key: "staff:7" }]);
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useSyncFavPeopleAnimeIds(USER, STAFF, [], true));

    await waitFor(() => {
      expect(useSearchStore.getState().favPeopleAnimeIds).toEqual([2001]);
    });
  });

  it("serves fresh cache instantly without refetching people", async () => {
    const now = Date.now();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") {
        return Promise.resolve(
          cacheRecord({
            people: {
              "character:9": { animeIds: [3001], kind: "character", updatedAt: now },
              "staff:7": { animeIds: [1001], kind: "staff", updatedAt: now },
            },
            version: 1,
          })
        );
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useSyncFavPeopleAnimeIds(USER, STAFF, CHARACTERS, true));

    await waitFor(() => {
      expect([...useSearchStore.getState().favPeopleAnimeIds].sort((a, b) => a - b)).toEqual([
        1001, 3001,
      ]);
    });
    const personCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "get_fav_people_media"
    );
    expect(personCalls).toEqual([]);
    expect(putPayloads()).toEqual([]);
  });

  it("drops cached people that are no longer favourites", async () => {
    const now = Date.now();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_app_cache") {
        return Promise.resolve(
          cacheRecord({
            people: {
              "staff:7": { animeIds: [1001], kind: "staff", updatedAt: now },
              "staff:8": { animeIds: [1002], kind: "staff", updatedAt: now },
            },
            version: 1,
          })
        );
      }
      return Promise.resolve(undefined);
    });

    renderHook(() => useSyncFavPeopleAnimeIds(USER, STAFF, [], true));

    await waitFor(() => {
      expect(useSearchStore.getState().favPeopleAnimeIds).toEqual([1001]);
    });
    const saved = putPayloads().at(-1);
    expect(Object.keys(saved?.people ?? {})).toEqual(["staff:7"]);
  });
});
