import * as z from "zod/mini";

const CardKindSchema = z.enum(["anime", "manga", "character", "staff", "studio"]);
const CardRaritySchema = z.enum(["junk", "common", "rare", "epic", "legendary"]);
const CardVariantSchema = z.enum(["normal", "foil", "holo"]);

const RarityBaseValuesSchema = z.object({
  junk: z.number(),
  common: z.number(),
  rare: z.number(),
  epic: z.number(),
  legendary: z.number(),
});

const VariantMultipliersSchema = z.object({
  normal: z.number(),
  foil: z.number(),
  holo: z.number(),
});

const VariantWeightsSchema = VariantMultipliersSchema;

const PackSlotSchema = z.object({
  kind: CardKindSchema,
  count: z.number(),
});

const PackChanceSchema = z.object({
  kind: CardKindSchema,
  weight: z.number(),
});

const ShopPackConfigSchema = z.object({
  packKind: z.string(),
  price: z.number(),
  size: z.number(),
  contents: z.array(PackSlotSchema),
  chances: z.array(PackChanceSchema),
});

const CardsConfigSchema = z.object({
  packSize: z.number(),
  guaranteedRarePlus: z.boolean(),
  baseValues: RarityBaseValuesSchema,
  variantMultipliers: VariantMultipliersSchema,
  variantWeights: VariantWeightsSchema,
  shopPacks: z.array(ShopPackConfigSchema),
  kinds: z.array(CardKindSchema),
  rarities: z.array(CardRaritySchema),
  variants: z.array(CardVariantSchema),
});

export const CardsBootstrapSchema = z.compile(
  z.object({
    config: CardsConfigSchema,
    grantEnabled: z.boolean(),
    testToolsEnabled: z.boolean(),
    wallet: z.number(),
    unopenedPacks: z.number(),
    starterGranted: z.boolean(),
    starterPacks: z.number(),
  })
);

export const CardPackSchema = z.compile(
  z.object({
    id: z.string(),
    source: z.string(),
    packKind: z.string(),
    mediaId: z.nullable(z.number()),
    seed: z.number(),
    size: z.number(),
    createdAt: z.number(),
    openedAt: z.nullable(z.number()),
    contentsState: z.enum(["pending", "ready", "failed"]),
  })
);

export const PackPreparationSchema = z.compile(
  z.object({
    prepared: z.number(),
    failed: z.number(),
    unnotified: z.number(),
  })
);

export const CardPackListSchema = z.compile(z.array(CardPackSchema));

export const OpenedCardSchema = z.compile(
  z.object({
    kind: CardKindSchema,
    entityId: z.number(),
    title: z.string(),
    imageUrl: z.nullable(z.string()),
    collage: z.array(z.string()),
    rarity: CardRaritySchema,
    variant: CardVariantSchema,
    value: z.number(),
    collectionAnimeId: z.nullable(z.number()),
    collectionTitle: z.nullable(z.string()),
    collectionCoverUrl: z.nullable(z.string()),
  })
);

export const PackOpeningSchema = z.compile(
  z.object({
    packId: z.string(),
    cards: z.array(OpenedCardSchema),
    value: z.number(),
  })
);

export const GiftCardSchema = z.compile(
  z.object({
    kind: CardKindSchema,
    entityId: z.number(),
    title: z.string(),
    imageUrl: z.nullable(z.string()),
    collage: z.array(z.string()),
    rarity: CardRaritySchema,
    variant: CardVariantSchema,
    value: z.number(),
    copies: z.number(),
    firstObtainedAt: z.number(),
    lastObtainedAt: z.number(),
    collectionAnimeId: z.nullable(z.number()),
    collectionTitle: z.nullable(z.string()),
    collectionCoverUrl: z.nullable(z.string()),
  })
);

export const GiftCardsSchema = z.compile(z.array(GiftCardSchema));

export const CreatedGiftSchema = z.compile(
  z.object({
    id: z.string(),
    cards: z.array(GiftCardSchema),
  })
);

export const GiftItemSchema = z.compile(
  z.object({
    id: z.string(),
    createdAt: z.number(),
    claimedAt: z.nullable(z.number()),
    cards: z.array(GiftCardSchema),
    totalCopies: z.number(),
  })
);

export const GiftListSchema = z.compile(z.array(GiftItemSchema));

export const GiftDeleteResultSchema = z.compile(
  z.object({
    returned: z.boolean(),
  })
);

const CollectionItemSchema = z.object({
  kind: CardKindSchema,
  entityId: z.number(),
  title: z.string(),
  imageUrl: z.nullable(z.string()),
  collage: z.array(z.string()),
  rarity: CardRaritySchema,
  variant: CardVariantSchema,
  copies: z.number(),
  value: z.number(),
  totalValue: z.number(),
  firstObtainedAt: z.number(),
  lastObtainedAt: z.number(),
  collectionAnimeId: z.nullable(z.number()),
  collectionTitle: z.nullable(z.string()),
  isFavorite: z.boolean(),
});

export const CardVariantsSchema = z.compile(z.array(CollectionItemSchema));

const CardGalleryImageSchema = z.object({
  url: z.string(),
  thumbUrl: z.string(),
});

export const CardGallerySchema = z.compile(
  z.object({
    images: z.array(CardGalleryImageSchema),
    preferredUrl: z.nullable(z.string()),
  })
);

export const CollectionPageSchema = z.compile(
  z.object({
    items: z.array(CollectionItemSchema),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  })
);

const CollectionRarityCountsSchema = z.object({
  junk: z.number(),
  common: z.number(),
  rare: z.number(),
  epic: z.number(),
  legendary: z.number(),
});

const CollectionShelfItemSchema = z.object({
  animeId: z.number(),
  kind: CardKindSchema,
  title: z.string(),
  coverUrl: z.nullable(z.string()),
  owned: z.number(),
  rarity: CollectionRarityCountsSchema,
  totalValue: z.number(),
  lastObtainedAt: z.number(),
  total: z.nullable(z.number()),
});

export const CollectionShelfSchema = z.compile(z.array(CollectionShelfItemSchema));

const RosterCharacterSchema = z.object({
  entityId: z.number(),
  title: z.string(),
  imageUrl: z.nullable(z.string()),
  favourites: z.number(),
  owned: z.boolean(),
});

export const AnimeCollectionPageSchema = z.compile(
  z.object({
    animeId: z.number(),
    kind: CardKindSchema,
    title: z.string(),
    coverUrl: z.nullable(z.string()),
    owned: z.number(),
    rarity: CollectionRarityCountsSchema,
    items: z.array(CollectionItemSchema),
    roster: z.array(RosterCharacterSchema),
    rosterTotal: z.number(),
    rosterPage: z.number(),
    rosterHasMore: z.boolean(),
    rosterAvailable: z.boolean(),
  })
);

export const CollectionRosterPageSchema = z.compile(
  z.object({
    page: z.number(),
    total: z.number(),
    hasMore: z.boolean(),
    available: z.boolean(),
    characters: z.array(RosterCharacterSchema),
  })
);

const CardPullSchema = z.object({
  kind: CardKindSchema,
  entityId: z.number(),
  title: z.string(),
  imageUrl: z.nullable(z.string()),
  rarity: CardRaritySchema,
  variant: CardVariantSchema,
  value: z.number(),
  at: z.number(),
});

export const CardsUnreadSchema = z.compile(
  z.object({
    packs: z.number(),
    cards: z.number(),
  })
);

export const CardsStatsSchema = z.compile(
  z.object({
    totalCards: z.number(),
    uniqueCards: z.number(),
    duplicates: z.number(),
    totalValue: z.number(),
    legendaryCards: z.number(),
    activeGifts: z.number(),
    lastPulls: z.array(CardPullSchema),
  })
);

export const SetCardVariantSchema = z.compile(z.number());

export const CardFavoriteSchema = z.compile(z.boolean());

export const ResetCollectionSchema = z.compile(z.number());

export const DustResultSchema = z.compile(
  z.object({
    remaining: z.number(),
    amount: z.number(),
    wallet: z.number(),
  })
);

export const PurchaseResultSchema = z.compile(
  z.object({
    pack: CardPackSchema,
    price: z.number(),
    wallet: z.number(),
  })
);

export const GrantResultSchema = z.compile(
  z.object({
    granted: z.boolean(),
    packs: z.number(),
  })
);
