import type {
  AnimeCollectionPage,
  CardPackRow,
  CardsBootstrap,
  CardsConfig,
  CardsStats,
  CollectionItem,
  CollectionPage,
  CollectionShelfItem,
  GiftCard,
  OpenedCard,
  PackOpening,
  PurchaseResult,
} from "@/types/api/cards";

const CONFIG: CardsConfig = {
  packSize: 7,
  guaranteedRarePlus: true,
  baseValues: { junk: 1, common: 2, rare: 5, epic: 15, legendary: 40 },
  variantMultipliers: { normal: 1, foil: 1.5, holo: 3 },
  variantWeights: { normal: 85, foil: 12, holo: 3 },
  shopPacks: [
    {
      packKind: "default",
      price: 100,
      size: 7,
      contents: [],
      chances: [
        { kind: "character", weight: 75 },
        { kind: "anime", weight: 15 },
        { kind: "manga", weight: 10 },
      ],
    },
    {
      packKind: "character",
      price: 100,
      size: 7,
      contents: [{ kind: "character", count: 7 }],
      chances: [],
    },
    {
      packKind: "anime",
      price: 100,
      size: 7,
      contents: [{ kind: "anime", count: 7 }],
      chances: [],
    },
    {
      packKind: "manga",
      price: 100,
      size: 7,
      contents: [{ kind: "manga", count: 7 }],
      chances: [],
    },
    {
      packKind: "staff",
      price: 100,
      size: 7,
      contents: [{ kind: "staff", count: 7 }],
      chances: [],
    },
    {
      packKind: "studio",
      price: 100,
      size: 7,
      contents: [{ kind: "studio", count: 7 }],
      chances: [],
    },
  ],
  kinds: ["anime", "manga", "character", "staff", "studio"],
  rarities: ["junk", "common", "rare", "epic", "legendary"],
  variants: ["normal", "foil", "holo"],
};

export function makeBootstrap(overrides: Partial<CardsBootstrap> = {}): CardsBootstrap {
  return {
    config: CONFIG,
    grantEnabled: false,
    testToolsEnabled: true,
    wallet: 500,
    unopenedPacks: 0,
    starterGranted: false,
    starterPacks: 0,
    ...overrides,
  };
}

export function makeCardsStats(overrides: Partial<CardsStats> = {}): CardsStats {
  return {
    totalCards: 0,
    uniqueCards: 0,
    duplicates: 0,
    totalValue: 0,
    legendaryCards: 0,
    activeGifts: 0,
    lastPulls: [],
    ...overrides,
  };
}

export function makePack(overrides: Partial<CardPackRow> = {}): CardPackRow {
  return {
    id: "pack-1",
    source: "test",
    packKind: "default",
    mediaId: null,
    seed: 7,
    size: 7,
    createdAt: 1_760_000_000,
    openedAt: null,
    contentsState: "ready",
    ...overrides,
  };
}

export function makeOpenedCards(count = 7): OpenedCard[] {
  const kinds = ["character", "anime", "staff", "studio"] as const;
  return Array.from({ length: count }, (_, index) => ({
    kind: kinds[index % kinds.length] ?? "character",
    entityId: 100 + index,
    title: `Card ${index + 1}`,
    imageUrl: null,
    collage: [],
    rarity: index === 0 ? "rare" : "common",
    variant: index === 1 ? "foil" : "normal",
    value: 2 + index,
    collectionAnimeId: index % 4 === 0 ? 16498 : null,
    collectionTitle: index % 4 === 0 ? "Shingeki no Kyojin" : null,
    collectionCoverUrl: null,
  }));
}

export function makeGiftCards(count = 1): GiftCard[] {
  return makeOpenedCards(count).map((card, index) => ({
    ...card,
    copies: index === 0 ? 2 : 1,
    firstObtainedAt: 1_760_000_000,
    lastObtainedAt: 1_760_000_100,
  }));
}

export function makeOpening(cards = makeOpenedCards()): PackOpening {
  return {
    packId: "pack-1",
    cards,
    value: cards.reduce((sum, card) => sum + card.value, 0),
  };
}

export function makeCollectionItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return {
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
    firstObtainedAt: 1_760_000_000,
    lastObtainedAt: 1_760_000_100,
    collectionAnimeId: 16498,
    collectionTitle: "Shingeki no Kyojin",
    isFavorite: false,
    ...overrides,
  };
}

export function makeCollectionPage(overrides: Partial<CollectionPage> = {}): CollectionPage {
  return {
    items: [makeCollectionItem()],
    total: 1,
    page: 1,
    pageSize: 24,
    ...overrides,
  };
}

export function makePurchase(pack = makePack({ source: "purchase" })): PurchaseResult {
  return { pack, price: 100, wallet: 80 };
}

export function makeShelfItem(overrides: Partial<CollectionShelfItem> = {}): CollectionShelfItem {
  return {
    animeId: 16498,
    kind: "anime",
    title: "Shingeki no Kyojin",
    coverUrl: null,
    owned: 2,
    rarity: { junk: 0, common: 0, rare: 1, epic: 1, legendary: 0 },
    totalValue: 21,
    lastObtainedAt: 1_760_000_100,
    total: 8,
    ...overrides,
  };
}

export function makeAnimeCollectionPage(
  overrides: Partial<AnimeCollectionPage> = {}
): AnimeCollectionPage {
  return {
    animeId: 16498,
    kind: "anime",
    title: "Shingeki no Kyojin",
    coverUrl: null,
    owned: 2,
    rarity: { junk: 0, common: 0, rare: 1, epic: 1, legendary: 0 },
    items: [
      makeCollectionItem({ kind: "anime", entityId: 16498, title: "Shingeki no Kyojin" }),
      makeCollectionItem({ entityId: 45627, title: "Levi" }),
    ],
    roster: [
      { entityId: 45627, title: "Levi", imageUrl: null, favourites: 10, owned: true },
      { entityId: 45628, title: "Eren", imageUrl: null, favourites: 9, owned: false },
      { entityId: 45629, title: "Mikasa", imageUrl: null, favourites: 8, owned: false },
    ],
    rosterTotal: 3,
    rosterPage: 3,
    rosterHasMore: false,
    rosterAvailable: true,
    ...overrides,
  };
}
