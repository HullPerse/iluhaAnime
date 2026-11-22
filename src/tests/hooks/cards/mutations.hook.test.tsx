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
    client.setQueryData(queryKeys.cardsBootstrap(), { wallet: 120 });
    const { result } = renderHook(() => useCardsMutations(), { wrapper });

    act(() => result.current.buyPack.mutate("character"));

    await waitFor(() => expect(result.current.buyPack.isSuccess).toBe(true));
    expect(purchase).toHaveBeenCalledWith("character");
    expect(client.getQueryState(queryKeys.cardsBootstrap())?.isInvalidated).toBe(true);
  });
});
