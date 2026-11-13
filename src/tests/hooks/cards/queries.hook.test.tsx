import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cardsApi } from "@/api/cards.api";
import {
  useCardsBootstrap,
  useCardsCollection,
  useCardsPacks,
  useCardsStats,
} from "@/hooks/cards/queries.hook";
import type { CardsBootstrap, CollectionPage, CardsStats } from "@/types/api/cards";

const CONFIG: CardsBootstrap["config"] = {
  packSize: 7,
  guaranteedRarePlus: true,
  baseValues: { junk: 1, common: 2, rare: 5, epic: 15, legendary: 40 },
  variantMultipliers: { normal: 1, foil: 1.5, holo: 3 },
  variantWeights: { normal: 85, foil: 12, holo: 3 },
  shopPacks: [
    {
      packKind: "default",
      price: 120,
      size: 7,
      contents: [],
      chances: [
        { kind: "character", weight: 75 },
        { kind: "anime", weight: 15 },
        { kind: "manga", weight: 10 },
      ],
    },
  ],
  kinds: ["anime", "manga", "character", "staff", "studio"],
  rarities: ["junk", "common", "rare", "epic", "legendary"],
  variants: ["normal", "foil", "holo"],
};

const BOOTSTRAP: CardsBootstrap = {
  config: CONFIG,
  grantEnabled: false,
  testToolsEnabled: true,
  wallet: 15,
  unopenedPacks: 2,
  starterGranted: false,
  starterPacks: 0,
};

const PACK = {
  id: "test-1",
  source: "test",
  packKind: "default",
  mediaId: null,
  seed: 1,
  size: 7,
  createdAt: 1,
  openedAt: null,
  contentsState: "ready" as const,
};

const PAGE: CollectionPage = {
  items: [
    {
      kind: "character",
      entityId: 45627,
      title: "Levi",
      imageUrl: null,
      collage: [],
      rarity: "rare",
      variant: "foil",
      copies: 2,
      value: 8,
      totalValue: 16,
      firstObtainedAt: 1,
      lastObtainedAt: 2,
      collectionAnimeId: 16498,
      collectionTitle: "Shingeki no Kyojin",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 24,
};

const STATS: CardsStats = {
  totalCards: 2,
  uniqueCards: 1,
  duplicates: 1,
  totalValue: 16,
  legendaryCards: 0,
  lastPulls: [],
};

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});

describe("cards queries", () => {
  it("loads the bootstrap", async () => {
    vi.spyOn(cardsApi, "bootstrap").mockResolvedValue(BOOTSTRAP);
    const { result } = renderHook(() => useCardsBootstrap(), { wrapper });

    await waitFor(() => expect(result.current.data?.wallet).toBe(15));
    expect(cardsApi.bootstrap).toHaveBeenCalledTimes(1);
  });

  it("loads packs and stats through the slow preset", async () => {
    vi.spyOn(cardsApi, "packs").mockResolvedValue([PACK]);
    vi.spyOn(cardsApi, "stats").mockResolvedValue(STATS);
    const packs = renderHook(() => useCardsPacks(), { wrapper });
    const stats = renderHook(() => useCardsStats(), { wrapper });

    await waitFor(() => expect(packs.result.current.data).toHaveLength(1));
    await waitFor(() => expect(stats.result.current.data?.totalCards).toBe(2));
  });

  it("passes the filters and the configured proxy to the collection", async () => {
    const collection = vi.spyOn(cardsApi, "collection").mockResolvedValue(PAGE);
    const { result } = renderHook(
      () => useCardsCollection({ kind: "character", sort: "value", page: 2 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data?.items[0]?.title).toBe("Levi"));
    expect(collection).toHaveBeenCalledWith(
      { kind: "character", sort: "value", page: 2 },
      null
    );
  });
});
