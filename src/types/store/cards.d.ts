import type { Cell } from "@/types/core/signal";
import type { CardKind, CardRarity, CollectionShelfSort } from "@/types/api/cards";

export type CardsTab = "packs" | "album" | "shop" | "gifts";
export type CardsSort = "recent" | "value" | "rarity" | "title" | "kind";
export type CardsSortDir = "asc" | "desc";
export type CardsCollectionSort = CollectionShelfSort;
export type CardsAlbumMode = "all" | "collections";

export interface CardsUiState {
  tab: CardsTab;
  kind: CardKind | null;
  rarity: CardRarity | null;
  sort: CardsSort;
  sortDir: CardsSortDir;
  collectionSort: CardsCollectionSort;
  collectionSortDir: CardsSortDir;
  albumMode: CardsAlbumMode;
  binderPage: number;
  revealOpen: boolean;
  packsReadAt: number;
  albumReadAt: number;
  packsNewSince: number;
  albumNewSince: number;
}

export interface CardsUiAtoms {
  tab: Cell<CardsTab>;
  kind: Cell<CardKind | null>;
  rarity: Cell<CardRarity | null>;
  sort: Cell<CardsSort>;
  sortDir: Cell<CardsSortDir>;
  collectionSort: Cell<CardsCollectionSort>;
  collectionSortDir: Cell<CardsSortDir>;
  albumMode: Cell<CardsAlbumMode>;
  binderPage: Cell<number>;
  revealOpen: Cell<boolean>;
  packsReadAt: Cell<number>;
  albumReadAt: Cell<number>;
  packsNewSince: Cell<number>;
  albumNewSince: Cell<number>;
}

export interface CardsSignalStore {
  atoms: CardsUiAtoms;
  setTab: (tab: CardsTab) => void;
  setKind: (kind: CardKind | null) => void;
  setRarity: (rarity: CardRarity | null) => void;
  setSort: (sort: CardsSort) => void;
  setSortDir: (dir: CardsSortDir) => void;
  setCollectionSort: (sort: CardsCollectionSort) => void;
  setCollectionSortDir: (dir: CardsSortDir) => void;
  setAlbumMode: (mode: CardsAlbumMode) => void;
  setBinderPage: (page: number) => void;
  setRevealOpen: (open: boolean) => void;
  setPacksReadAt: (at: number) => void;
  setAlbumReadAt: (at: number) => void;
  setPacksNewSince: (at: number) => void;
  setAlbumNewSince: (at: number) => void;
  reset: () => void;
}
