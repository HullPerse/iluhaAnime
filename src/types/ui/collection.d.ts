import type {
  CardGiftStack,
  CardKind,
  CardRarity,
  CardVariant,
  CollectionItem,
  GiftItem,
  RosterCharacter,
} from "@/types/api/cards";

export interface CardFaceItem {
  kind: CardKind;
  entityId: number;
  title: string;
  imageUrl: string | null;
  collage: string[];
  rarity: CardRarity;
  variant: CardVariant;
  value: number;
  isFavorite?: boolean;
}

export interface CardTileItem extends CardFaceItem {
  copies?: number;
  totalValue?: number;
  firstObtainedAt?: number;
}

export interface GiftCardProps {
  gift: GiftItem;
  deleting: boolean;
  copyError: boolean;
  onDelete: () => void;
  onCopyError: (giftId: string | null) => void;
}

export type GiftStack = Pick<CardGiftStack, "rarity" | "variant" | "copies">;

export type CollectionSlot =
  | { kind: "owned"; card: CollectionItem }
  | { kind: "missing"; entityId: number };

export interface BinderPage<T> {
  slots: (T | null)[];
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
}

export type ConfirmStep = 0 | 1 | 2;

export type PackOpeningPhase = "intro" | "reveal";

export interface CardDragState {
  pointerId: number;
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
}

export interface GiftPayload {
  readonly cards: CardGiftStack[];
  readonly preview?: import("@/types/core/deeplink").CardGiftPreview;
}
