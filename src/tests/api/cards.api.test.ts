import { describe, expect, it } from "vitest";

import { CardsApi } from "@/api/cards.api";
import type { CardsBootstrap } from "@/types/api/cards";
import type { ApiTransport } from "@/types/core/transport";

const config: CardsBootstrap["config"] = {
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
        { kind: "character", weight: 70 },
        { kind: "anime", weight: 30 },
      ],
    },
  ],
  kinds: ["anime", "character", "staff", "studio"],
  rarities: ["junk", "common", "rare", "epic", "legendary"],
  variants: ["normal", "foil", "holo"],
};

const bootstrap: CardsBootstrap = {
  config,
  grantEnabled: false,
  testToolsEnabled: true,
  wallet: 0,
  unopenedPacks: 1,
  starterGranted: false,
  starterPacks: 0,
};

const pack = {
  id: "test-1",
  source: "test",
  packKind: "default",
  mediaId: null,
  seed: 1,
  size: 7,
  createdAt: 1,
  openedAt: null,
  contentsState: "pending" as const,
};

const openedCard = {
  kind: "character",
  entityId: 45627,
  title: "Levi",
  imageUrl: null,
  collage: [],
  rarity: "rare",
  variant: "foil",
  value: 8,
  collectionAnimeId: 16498,
  collectionTitle: "Shingeki no Kyojin",
  collectionCoverUrl: null,
};

const collectionItem = {
  ...openedCard,
  copies: 2,
  totalValue: 16,
  firstObtainedAt: 1,
  lastObtainedAt: 2,
  collectionAnimeId: 16498,
  collectionTitle: "Shingeki no Kyojin",
};

function fakeTransport(responses: Record<string, unknown>) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return responses[command] as T;
    },
  };
  return { calls, transport };
}

describe("CardsApi", () => {
  it("maps bootstrap, packs and both test grants", async () => {
    const legendaryPack = { ...pack, id: "legendary-test-1" };
    const { calls, transport } = fakeTransport({
      cards_bootstrap: bootstrap,
      cards_packs: [pack],
      cards_grant_test_pack: pack,
      cards_grant_test_legendary_pack: legendaryPack,
    });
    const api = new CardsApi({ transport });

    const bootstrapValue = await api.bootstrap();
    const packs = await api.packs();
    const grantedPack = await api.grantTestPack();
    const legendary = await api.grantTestLegendaryPack();
    expect(bootstrapValue.wallet).toBe(0);
    expect(packs).toHaveLength(1);
    expect(grantedPack.id).toBe("test-1");
    expect(legendary.id).toBe("legendary-test-1");

    expect(calls).toEqual([
      { command: "cards_bootstrap", args: undefined },
      { command: "cards_packs", args: undefined },
      { command: "cards_grant_test_pack", args: undefined },
      { command: "cards_grant_test_legendary_pack", args: undefined },
    ]);
  });

  it("passes collection filters and the AniList proxy", async () => {
    const { calls, transport } = fakeTransport({
      cards_collection: {
        items: [collectionItem],
        total: 1,
        page: 2,
        pageSize: 12,
      },
    });
    const api = new CardsApi({ transport });

    const page = await api.collection(
      {
        kind: "character",
        rarity: "rare",
        variant: "foil",
        sort: "value",
        sortDir: "asc",
        page: 2,
        pageSize: 12,
      },
      "http://127.0.0.1:7890"
    );

    expect(page.items[0]?.title).toBe("Levi");
    expect(calls).toEqual([
      {
        command: "cards_collection",
        args: {
          kind: "character",
          rarity: "rare",
          variant: "foil",
          sort: "value",
          sortDir: "asc",
          query: null,
          page: 2,
          pageSize: 12,
          proxyUrl: "http://127.0.0.1:7890",
        },
      },
    ]);
  });

  it("maps the collection shelf and one anime collection with its proxy", async () => {
    const { calls, transport } = fakeTransport({
      cards_collections: [
        {
          animeId: 16498,
          kind: "anime",
          title: "Shingeki no Kyojin",
          coverUrl: null,
          owned: 2,
          rarity: { junk: 0, common: 0, rare: 1, epic: 1, legendary: 0 },
          totalValue: 21,
          lastObtainedAt: 1_760_000_100,
          total: 8,
        },
      ],
      cards_anime_collection: {
        animeId: 16498,
        kind: "anime",
        title: "Shingeki no Kyojin",
        coverUrl: null,
        owned: 2,
        rarity: { junk: 0, common: 0, rare: 1, epic: 1, legendary: 0 },
        items: [collectionItem],
        roster: [
          {
            entityId: 45627,
            title: "Levi",
            imageUrl: null,
            favourites: 10,
            owned: true,
          },
        ],
        rosterTotal: 1,
        rosterPage: 1,
        rosterHasMore: false,
        rosterAvailable: true,
      },
    });
    const api = new CardsApi({ transport });

    const shelf = await api.collections();
    const collection = await api.animeCollection(16498, "anime", "http://127.0.0.1:7890");

    expect(shelf[0]?.owned).toBe(2);
    expect(collection.roster[0]?.owned).toBe(true);
    expect(calls).toEqual([
      { command: "cards_collections", args: { sort: "recent", sortDir: "desc" } },
      {
        command: "cards_anime_collection",
        args: { animeId: 16498, kind: "anime", proxyUrl: "http://127.0.0.1:7890" },
      },
    ]);
  });

  it("asks for one roster page at a time", async () => {
    const { calls, transport } = fakeTransport({
      cards_collection_roster: {
        page: 4,
        total: 212,
        hasMore: true,
        available: true,
        characters: [],
      },
    });
    const api = new CardsApi({ transport });

    const roster = await api.collectionRoster(16498, "anime", 4);

    expect(roster.total).toBe(212);
    expect(roster.hasMore).toBe(true);
    expect(calls).toEqual([
      {
        command: "cards_collection_roster",
        args: { mediaId: 16498, kind: "anime", page: 4 },
      },
    ]);
  });

  it("prepares and acknowledges ready packs", async () => {
    const { calls, transport } = fakeTransport({
      cards_prepare_packs: { prepared: 2, failed: 0, unnotified: 2 },
      cards_ack_prepared_packs: 2,
    });
    const api = new CardsApi({ transport });

    const result = await api.preparePacks("http://127.0.0.1:7890");
    await api.acknowledgePreparedPacks();

    expect(result).toEqual({ prepared: 2, failed: 0, unnotified: 2 });
    expect(calls).toEqual([
      {
        command: "cards_prepare_packs",
        args: { proxyUrl: "http://127.0.0.1:7890" },
      },
      { command: "cards_ack_prepared_packs", args: undefined },
    ]);
  });

  it("maps open, dust, buy, starter and gift commands", async () => {
    const { calls, transport } = fakeTransport({
      cards_open_pack: { packId: "test-1", cards: [openedCard], value: openedCard.value },
      cards_dust: { remaining: 1, amount: 8, wallet: 8 },
      cards_buy_pack: { pack, price: 120, wallet: 8 },
      cards_grant_starter: { granted: false, packs: 0 },
      cards_claim_gift: openedCard,
    });
    const api = new CardsApi({ transport });

    await api.openPack("test-1", "http://127.0.0.1:7890");
    await api.dust({
      kind: "character",
      entityId: 45627,
      rarity: "rare",
      variant: "foil",
    });
    await api.buyPack("character");
    await api.grantStarter(7, null);
    await api.claimGift("gift-1");

    expect(calls).toEqual([
      {
        command: "cards_open_pack",
        args: { packId: "test-1", proxyUrl: "http://127.0.0.1:7890" },
      },
      {
        command: "cards_dust",
        args: {
          kind: "character",
          entityId: 45627,
          rarity: "rare",
          variant: "foil",
        },
      },
      { command: "cards_buy_pack", args: { packKind: "character" } },
      { command: "cards_grant_starter", args: { userId: 7 } },
      { command: "cards_claim_gift", args: { giftId: "gift-1" } },
    ]);
  });
});
