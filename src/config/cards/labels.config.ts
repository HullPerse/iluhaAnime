import type { TranslationKey } from "@/types/core/i18n";
import type { CardKind, CardRarity, CardVariant } from "@/types/api/cards";
import type { CardsCollectionSort, CardsSort, CardsTab } from "@/types/store/cards";

export const CARD_KINDS = ["anime", "manga", "character", "staff", "studio"] as const;
export const CARD_RARITIES = ["junk", "common", "rare", "epic", "legendary"] as const;
export const CARD_VARIANTS = ["normal", "foil", "holo"] as const;
export const CARD_SORTS = ["recent", "value", "rarity", "title", "kind"] as const;
export const COLLECTION_SORTS = [...CARD_SORTS, "completion", "owned"] as const;
export const CARDS_TABS = ["packs", "album", "shop"] as const;

export const cardsTabLabelKeys = {
  packs: "collection.tabs.packs",
  album: "collection.tabs.album",
  shop: "collection.tabs.shop",
} satisfies Record<CardsTab, TranslationKey>;

export const cardKindLabelKeys = {
  anime: "collection.kind.anime",
  manga: "collection.kind.manga",
  character: "collection.kind.character",
  staff: "collection.kind.staff",
  studio: "collection.kind.studio",
} satisfies Record<CardKind, TranslationKey>;

export const cardRarityLabelKeys = {
  junk: "collection.rarity.junk",
  common: "collection.rarity.common",
  rare: "collection.rarity.rare",
  epic: "collection.rarity.epic",
  legendary: "collection.rarity.legendary",
} satisfies Record<CardRarity, TranslationKey>;

export const cardVariantLabelKeys = {
  normal: "collection.variant.normal",
  foil: "collection.variant.foil",
  holo: "collection.variant.holo",
} satisfies Record<CardVariant, TranslationKey>;

export const cardsSortLabelKeys = {
  recent: "collection.sort.recent",
  value: "collection.sort.value",
  rarity: "collection.sort.rarity",
  title: "collection.sort.title",
  kind: "collection.sort.kind",
} satisfies Record<CardsSort, TranslationKey>;

export const collectionSortLabelKeys = {
  ...cardsSortLabelKeys,
  completion: "collection.sort.completion",
  owned: "collection.sort.owned",
} satisfies Record<CardsCollectionSort, TranslationKey>;

export const cardSourceLabelKeys: Record<string, TranslationKey> = {
  test: "collection.source.test",
  purchase: "collection.source.purchase",
  starter: "collection.source.starter",
  completion: "collection.source.completion",
  gift: "collection.source.gift",
};

export function cardSourceLabelKey(source: string): TranslationKey {
  return cardSourceLabelKeys[source] ?? "collection.source.other";
}

/// AniList MediaSource values. Unknown/new values fall back to a humanized
/// enum name in the card detail instead of an empty line.
export const animeSourceLabelKeys: Record<string, TranslationKey> = {
  ORIGINAL: "anilist.filters.source.original",
  MANGA: "anilist.filters.source.manga",
  LIGHT_NOVEL: "anilist.filters.source.light.novel",
  NOVEL: "anilist.filters.source.novel",
  VISUAL_NOVEL: "anilist.filters.source.visual.novel",
  VIDEO_GAME: "anilist.filters.source.video.game",
  WEB_MANGA: "anilist.filters.source.web.manga",
  OTHER: "anilist.filters.source.other",
};

export function packLabelKey(packKind: string): TranslationKey {
  if (packKind === "default") return "collection.packs.default";
  if (packKind in cardKindLabelKeys) return cardKindLabelKeys[packKind as CardKind];
  return "collection.packs.other";
}
