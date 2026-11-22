import { describe, expect, it } from "vitest";

import { CardsApi } from "@/api/cards.api";
import type { CardsBootstrap } from "@/types/api/cards";
import type { ApiTransport } from "@/types/core/transport";

const config: CardsBootstrap["config"] = {
  packSize: 7,
  guaranteedRarePlus: true,
  baseValues: { junk: 1, common: 2, rare: 5, epic: 15, legendary: 40 },
  variantMultipliers: { normal: 1, foil: 1.5, holo: 3, cursed: 3 },
  variantWeights: { normal: 84, foil: 12, holo: 3, cursed: 1 },
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
  mediaKind: null,
  seed: 1,
  size: 7,
  createdAt: 1,
  openedAt: null,
  contentsState: "pending" as const,
  claimedAt: null,
  chosenSlot: null,
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

const giftCard = {
  ...openedCard,
  copies: 2,
  firstObtainedAt: 1,
  lastObtainedAt: 2,
};

const collectionItem = {
  ...openedCard,
  copies: 2,
  totalValue: 16,
  firstObtainedAt: 1,
  lastObtainedAt: 2,
  collectionAnimeId: 16498,
  collectionTitle: "Shingeki no Kyojin",
  isFavorite: false,
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
  it("maps bootstrap and packs", async () => {
    const { calls, transport } = fakeTransport({
      cards_bootstrap: bootstrap,
      cards_packs: [pack],
    });
    const api = new CardsApi({ transport });

    const bootstrapValue = await api.bootstrap();
    const packs = await api.packs();
    expect(bootstrapValue.wallet).toBe(0);
    expect(packs).toHaveLength(1);

    expect(calls).toEqual([
      { command: "cards_bootstrap", args: undefined },
      { command: "cards_packs", args: undefined },
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

  it("loads the art gallery and persists the chosen image", async () => {
    const gallery = {
      images: [{ url: "https://cdn/levi-alt.jpg", thumbUrl: "https://cdn/levi-thumb.jpg" }],
      preferredUrl: null,
    };
    const { calls, transport } = fakeTransport({
      cards_gallery: gallery,
      cards_set_preferred_image: 1,
    });
    const api = new CardsApi({ transport });

    const loaded = await api.gallery("character", 45627, "http://127.0.0.1:7890");
    const changed = await api.setPreferredImage("character", 45627, "https://cdn/levi-alt.jpg");

    expect(loaded.images[0]?.thumbUrl).toBe("https://cdn/levi-thumb.jpg");
    expect(changed).toBe(1);
    expect(calls).toEqual([
      {
        command: "cards_gallery",
        args: { kind: "character", entityId: 45627, proxyUrl: "http://127.0.0.1:7890" },
      },
      {
        command: "cards_set_preferred_image",
        args: {
          kind: "character",
          entityId: 45627,
          imageUrl: "https://cdn/levi-alt.jpg",
        },
      },
    ]);
  });

  it("reads and toggles the card favorite", async () => {
    const { calls, transport } = fakeTransport({
      cards_card_favorite: true,
      cards_set_card_favorite: false,
    });
    const api = new CardsApi({ transport });

    expect(await api.isCardFavorite("character", 45627)).toBe(true);
    expect(await api.setCardFavorite("character", 45627, false)).toBe(false);
    expect(calls).toEqual([
      { command: "cards_card_favorite", args: { kind: "character", entityId: 45627 } },
      {
        command: "cards_set_card_favorite",
        args: { kind: "character", entityId: 45627, favorite: false },
      },
    ]);
  });

  it("prepares and acknowledges ready packs", async () => {
    const { calls, transport } = fakeTransport({
      cards_prepare_packs: { prepared: 2, failed: 0, repaired: 0, unnotified: 2 },
      cards_ack_prepared_packs: 2,
    });
    const api = new CardsApi({ transport });

    const result = await api.preparePacks("http://127.0.0.1:7890");
    await api.acknowledgePreparedPacks();

    expect(result).toEqual({ prepared: 2, failed: 0, repaired: 0, unnotified: 2 });
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
      cards_open_pack: {
        packId: "test-1",
        cards: [openedCard],
        value: openedCard.value,
        chosenSlot: null,
      },
      cards_dust: { remaining: 1, amount: 8, wallet: 8 },
      cards_buy_pack: { pack, price: 120, wallet: 8 },
      cards_grant_starter: { granted: false, packs: 0 },
      cards_create_gift: { id: "gift-2", cards: [giftCard] },
      cards_claim_gift: [giftCard],
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
    await api.createGift({ kind: "character", entityId: 45627 });
    await api.claimGift({
      giftId: "gift-1",
      kind: "character",
      entityId: 45627,
      cards: [
        {
          rarity: "rare",
          variant: "foil",
          copies: 2,
          value: 8,
          firstObtainedAt: 1,
          lastObtainedAt: 2,
        },
      ],
    });

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
      {
        command: "cards_create_gift",
        args: { kind: "character", entityId: 45627 },
      },
      {
        command: "cards_claim_gift",
        args: {
          giftId: "gift-1",
          kind: "character",
          entityId: 45627,
          cards: [
            {
              rarity: "rare",
              variant: "foil",
              copies: 2,
              value: 8,
              firstObtainedAt: 1,
              lastObtainedAt: 2,
            },
          ],
        },
      },
    ]);
  });
});
