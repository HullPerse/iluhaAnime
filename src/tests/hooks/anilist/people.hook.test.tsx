import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { anilistApi } from "@/api/anilist.api";
import { useFavouritePeopleToggles } from "@/hooks/anilist/people.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import type { AnilistRouteData, FavouritePerson } from "@/types/anilist/anilist";

const alice: FavouritePerson = { id: 1, name: "Alice", image: null };
const bob: FavouritePerson = { id: 2, name: "Bob", image: null };

describe("favourite people concurrent updates", () => {
  it("preserves another successful change when an earlier removal fails", async () => {
    const client = new QueryClient();
    const initial: AnilistRouteData = {
      user: null,
      lists: [],
      favourites: [],
      people: { staff: [alice, bob], characters: [] },
    };
    client.setQueryData(queryKeys.anilistData(), initial);
    let rejectAlice!: (error: Error) => void;
    const spy = vi
      .spyOn(anilistApi, "toggleFavouriteStaff")
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectAlice = reject;
          })
      )
      .mockResolvedValueOnce([alice]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFavouritePeopleToggles(), { wrapper });
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.toggleStaff(1);
      await result.current.toggleStaff(2);
    });
    await act(async () => {
      rejectAlice(new Error("failed"));
      await first;
    });
    expect(client.getQueryData<AnilistRouteData>(queryKeys.anilistData())?.people.staff).toEqual([
      alice,
    ]);
    spy.mockRestore();
  });

  it("merges out-of-order successful character responses by identity", async () => {
    const client = new QueryClient();
    client.setQueryData<AnilistRouteData>(queryKeys.anilistData(), {
      user: null,
      lists: [],
      favourites: [],
      people: { staff: [], characters: [] },
    });
    let finishAlice!: (people: FavouritePerson[]) => void;
    const spy = vi
      .spyOn(anilistApi, "toggleFavouriteCharacter")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishAlice = resolve;
          })
      )
      .mockResolvedValueOnce([alice, bob]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFavouritePeopleToggles(), { wrapper });
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.toggleCharacter(1);
      await result.current.toggleCharacter(2);
    });
    await act(async () => {
      finishAlice([alice]);
      await first;
    });
    expect(
      client
        .getQueryData<AnilistRouteData>(queryKeys.anilistData())
        ?.people.characters.map((p) => p.id)
        .sort()
    ).toEqual([1, 2]);
    spy.mockRestore();
  });
});
