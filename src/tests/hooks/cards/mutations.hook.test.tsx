import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cardsApi } from "@/api/cards.api";
import { useCardsMutations } from "@/hooks/cards/mutations.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";

const PACK = {
  id: "test-1",
  source: "test",
  packKind: "default",
  mediaId: null,
  mediaKind: null,
  seed: 1,
  size: 7,
  createdAt: 1,
  openedAt: null,
  contentsState: "pending" as const,
  claimedAt: null,
  chosenSlot: null,
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

  return { client, wrapper };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("cards mutations", () => {
  it("invalidates every card query after a mutation", async () => {
    vi.spyOn(cardsApi, "resetCollection").mockResolvedValue(1);
    const { client, wrapper } = setup();
    client.setQueryData(queryKeys.cardsPacks(""), []);
    const { result } = renderHook(() => useCardsMutations(), { wrapper });

    act(() => result.current.resetCollection.mutate());

    await waitFor(() => expect(result.current.resetCollection.isSuccess).toBe(true));
    expect(cardsApi.resetCollection).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(queryKeys.cardsPacks(""))?.isInvalidated).toBe(true);
  });

  it("buys the themed pack and invalidates the wallet", async () => {
    const purchase = vi
      .spyOn(cardsApi, "buyPack")
      .mockResolvedValue({ pack: PACK, price: 120, wallet: 0 });
    const { client, wrapper } = setup();
    client.setQueryData(queryKeys.cardsShell(), { bootstrap: { wallet: 120 } });
    const { result } = renderHook(() => useCardsMutations(), { wrapper });

    act(() => result.current.buyPack.mutate("character"));

    await waitFor(() => expect(result.current.buyPack.isSuccess).toBe(true));
    expect(purchase).toHaveBeenCalledWith("character", null);
    expect(client.getQueryState(queryKeys.cardsShell())?.isInvalidated).toBe(true);
  });

  it("refreshes both the gift outbox and the tab counter after creating a gift", async () => {
    vi.spyOn(cardsApi, "createGift").mockResolvedValue({ id: "gift-test", cards: [] });
    const { client, wrapper } = setup();
    const keys = [queryKeys.cardsGifts(), queryKeys.cardsShell()];

    for (const key of keys) client.setQueryData(key, []);

    const { result } = renderHook(() => useCardsMutations(), { wrapper });

    await act(() => result.current.createGift.mutateAsync({ kind: "character", entityId: 42 }));

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it("refreshes ownership after a choice claim persists even if the dialog unmounts", async () => {
    const { promise, resolve } =
      Promise.withResolvers<Awaited<ReturnType<typeof cardsApi.claimPack>>>();
    vi.spyOn(cardsApi, "claimPack").mockReturnValue(promise);
    const { client, wrapper } = setup();
    const keys = [
      queryKeys.cardsCollection({}, ""),
      queryKeys.cardsAnimeCollection(123, "anime", ""),
      queryKeys.cardsCollectionRoster(123, "anime", 1, ""),
      queryKeys.cardsCardVariants("character", 42),
    ];

    for (const key of keys) client.setQueryData(key, []);

    const { result, unmount } = renderHook(() => useCardsMutations(), { wrapper });
    const claimed = result.current.claimPack.mutateAsync({ packId: "choice", slot: 1 });
    unmount();

    resolve({ packId: "choice", cards: [], value: 1, chosenSlot: 1 });
    await claimed;

    for (const key of keys) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it("invalidates ownership at a regular pack commit and holds the wallet for the reveal", async () => {
    vi.spyOn(cardsApi, "openPack").mockResolvedValue({
      packId: "regular",
      cards: [],
      value: 8,
      chosenSlot: null,
    });
    const { client, wrapper } = setup();
    const albumKey = queryKeys.cardsCollection({}, "");
    const shellKey = queryKeys.cardsShell();
    client.setQueryData(albumKey, []);
    client.setQueryData(shellKey, { bootstrap: { wallet: 0 } });
    const { result } = renderHook(() => useCardsMutations(), { wrapper });

    await act(() => result.current.openPack.mutateAsync("regular"));

    expect(client.getQueryState(albumKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(shellKey)?.isInvalidated).toBe(false);
  });
});
