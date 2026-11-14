import {
  cardKindLabelKeys,
  cardRarityLabelKeys,
  cardVariantLabelKeys,
  cardsSortLabelKeys,
  collectionSortLabelKeys,
} from "@/config/cards/labels.config";
import type { CardKind, CardRarity, CardVariant } from "@/types/api/cards";
import type { CardsCollectionSort, CardsSort } from "@/types/store/cards";

export function isCardKind(value: string): value is CardKind {
  return Object.hasOwn(cardKindLabelKeys, value);
}

export function isCardRarity(value: string): value is CardRarity {
  return Object.hasOwn(cardRarityLabelKeys, value);
}

export function isCardVariant(value: string): value is CardVariant {
  return Object.hasOwn(cardVariantLabelKeys, value);
}

export function isCardsSort(value: string): value is CardsSort {
  return Object.hasOwn(cardsSortLabelKeys, value);
}

export function isCardsCollectionSort(value: string): value is CardsCollectionSort {
  return Object.hasOwn(collectionSortLabelKeys, value);
}
