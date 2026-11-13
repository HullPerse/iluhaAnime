import type { ApiTransport } from "@/types/core/transport";

export type CardKind = "anime" | "manga" | "character" | "staff" | "studio";
export type CardRarity = "junk" | "common" | "rare" | "epic" | "legendary";
export type CardVariant = "normal" | "foil" | "holo";

export interface RarityBaseValues {
  junk: number;
  common: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface VariantMultipliers {
  normal: number;
  foil: number;
  holo: number;
}

export interface VariantWeights {
  normal: number;
  foil: number;
  holo: number;
}

export interface PackSlot {
  kind: CardKind;
  count: number;
}

export interface PackChance {
  kind: CardKind;
  weight: number;
}

export interface ShopPackConfig {
  packKind: string;
  price: number;
  size: number;
  contents: PackSlot[];
  chances: PackChance[];
}

export interface CardsConfig {
  packSize: number;
  guaranteedRarePlus: boolean;
  baseValues: RarityBaseValues;
  variantMultipliers: VariantMultipliers;
  variantWeights: VariantWeights;
  shopPacks: ShopPackConfig[];
  kinds: CardKind[];
  rarities: CardRarity[];
  variants: CardVariant[];
}

export interface CardsBootstrap {
  config: CardsConfig;
  grantEnabled: boolean;
  testToolsEnabled: boolean;
  wallet: number;
  unopenedPacks: number;
  starterGranted: boolean;
  starterPacks: number;
}

export interface CardPackRow {
  id: string;
  source: string;
  packKind: string;
  mediaId: number | null;
  seed: number;
  size: number;
  createdAt: number;
  openedAt: number | null;
  contentsState: "pending" | "ready" | "failed";
}

export interface PackPreparation {
  prepared: number;
  failed: number;
  unnotified: number;
}

export interface OpenedCard {
  kind: CardKind;
  entityId: number;
  title: string;
  imageUrl: string | null;
  collage: string[];
  rarity: CardRarity;
  variant: CardVariant;
  value: number;
  collectionAnimeId: number | null;
  collectionTitle: string | null;
  collectionCoverUrl: string | null;
}

export interface PackOpening {
  packId: string;
  cards: OpenedCard[];
  value: number;
}

export interface CreatedGift {
  id: string;
  card: OpenedCard;
}

export interface CollectionItem {
  kind: CardKind;
  entityId: number;
  title: string;
  imageUrl: string | null;
  collage: string[];
  rarity: CardRarity;
  variant: CardVariant;
  copies: number;
  value: number;
  totalValue: number;
  firstObtainedAt: number;
  lastObtainedAt: number;
  collectionAnimeId: number | null;
  collectionTitle: string | null;
}

export interface CollectionPage {
  items: CollectionItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CollectionRarityCounts {
  junk: number;
  common: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface CollectionShelfItem {
  animeId: number;
  kind: CardKind;
  title: string;
  coverUrl: string | null;
  owned: number;
  rarity: CollectionRarityCounts;
  totalValue: number;
  lastObtainedAt: number;
  total: number | null;
}

export interface RosterCharacter {
  entityId: number;
  title: string;
  imageUrl: string | null;
  favourites: number;
  owned: boolean;
}

export interface AnimeCollectionPage {
  animeId: number;
  kind: CardKind;
  title: string;
  coverUrl: string | null;
  owned: number;
  rarity: CollectionRarityCounts;
  items: CollectionItem[];
  roster: RosterCharacter[];
  rosterTotal: number;
  rosterPage: number;
  rosterHasMore: boolean;
  rosterAvailable: boolean;
}

export interface CollectionRosterPage {
  page: number;
  total: number;
  hasMore: boolean;
  available: boolean;
  characters: RosterCharacter[];
}

export interface CardPull {
  kind: CardKind;
  entityId: number;
  title: string;
  imageUrl: string | null;
  rarity: CardRarity;
  variant: CardVariant;
  value: number;
  at: number;
}

export interface CardsUnread {
  packs: number;
  cards: number;
}

export interface CardsStats {
  totalCards: number;
  uniqueCards: number;
  duplicates: number;
  totalValue: number;
  legendaryCards: number;
  lastPulls: CardPull[];
}

export interface DustResult {
  remaining: number;
  amount: number;
  wallet: number;
}

export interface PurchaseResult {
  pack: CardPackRow;
  price: number;
  wallet: number;
}

export interface GrantResult {
  granted: boolean;
  packs: number;
}

export type CollectionShelfSort =
  | "recent"
  | "value"
  | "rarity"
  | "title"
  | "kind"
  | "completion"
  | "owned";

export interface CardsCollectionParams {
  kind?: CardKind | null;
  rarity?: CardRarity | null;
  variant?: CardVariant | null;
  sort?: CollectionShelfSort;
  sortDir?: "asc" | "desc";
  query?: string | null;
  page?: number;
  pageSize?: number;
}

export interface DustCardInput {
  kind: CardKind;
  entityId: number;
  rarity: CardRarity;
  variant: CardVariant;
}

export interface CardsApiConfig {
  transport?: ApiTransport;
}
