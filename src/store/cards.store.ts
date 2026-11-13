import { attemptSync } from "@hullperse/hp_utils/attempt";
import { createSignalStore } from "@hullperse/hp_utils/signal";

import { CARD_SORTS, COLLECTION_SORTS } from "@/config/cards/labels.config";
import { isRecord } from "@/lib/core/text/record.utils";
import type {
  CardsAlbumMode,
  CardsCollectionSort,
  CardsSignalStore,
  CardsSort,
  CardsSortDir,
  CardsTab,
} from "@/types/store/cards";
import type { CardKind, CardRarity } from "@/types/api/cards";

const SORT_STORAGE_KEY = "iluha.v1.cards-sort";
const SEEN_STORAGE_KEY = "iluha.v1.cards-seen";

const DEFAULT_SORT_DIR: Record<CardsSort, CardsSortDir> = {
  recent: "desc",
  value: "desc",
  rarity: "desc",
  title: "asc",
  kind: "asc",
};

const DEFAULT_COLLECTION_SORT_DIR: Record<CardsCollectionSort, CardsSortDir> = {
  ...DEFAULT_SORT_DIR,
  completion: "desc",
  owned: "desc",
};

const CARD_SORT_VALUES = new Set<string>(CARD_SORTS);
const COLLECTION_SORT_VALUES = new Set<string>(COLLECTION_SORTS);
const DIR_VALUES = new Set<string>(["asc", "desc"]);

interface SortState {
  sort: CardsSort;
  sortDir: CardsSortDir;
  collectionSort: CardsCollectionSort;
  collectionSortDir: CardsSortDir;
}

interface SeenState {
  packsReadAt: number;
  albumReadAt: number;
}

function readSortState(): Partial<SortState> {
  const [raw] = attemptSync(() => localStorage.getItem(SORT_STORAGE_KEY));
  if (!raw) return {};
  const [parsed] = attemptSync((): unknown => JSON.parse(raw));
  if (!isRecord(parsed)) return {};
  return {
    sort: CARD_SORT_VALUES.has(String(parsed.sort))
      ? (parsed.sort as CardsSort)
      : undefined,
    sortDir: DIR_VALUES.has(String(parsed.sortDir))
      ? (parsed.sortDir as CardsSortDir)
      : undefined,
    collectionSort: COLLECTION_SORT_VALUES.has(String(parsed.collectionSort))
      ? (parsed.collectionSort as CardsCollectionSort)
      : undefined,
    collectionSortDir: DIR_VALUES.has(String(parsed.collectionSortDir))
      ? (parsed.collectionSortDir as CardsSortDir)
      : undefined,
  };
}

function readSeenState(): Partial<SeenState> {
  const [raw] = attemptSync(() => localStorage.getItem(SEEN_STORAGE_KEY));
  if (!raw) return {};
  const [parsed] = attemptSync((): unknown => JSON.parse(raw));
  if (!isRecord(parsed)) return {};
  const at = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  return {
    packsReadAt: at(parsed.packsReadAt),
    albumReadAt: at(parsed.albumReadAt),
  };
}

const persisted = readSortState();
const persistedSeen = readSeenState();

const DEFAULT_STATE = {
  tab: "packs" as CardsTab,
  kind: null as CardKind | null,
  rarity: null as CardRarity | null,
  sort: persisted.sort ?? ("recent" as CardsSort),
  sortDir: persisted.sortDir ?? DEFAULT_SORT_DIR[persisted.sort ?? "recent"],
  collectionSort: persisted.collectionSort ?? ("recent" as CardsCollectionSort),
  collectionSortDir:
    persisted.collectionSortDir ??
    DEFAULT_COLLECTION_SORT_DIR[persisted.collectionSort ?? "recent"],
  albumMode: "all" as CardsAlbumMode,
  binderPage: 0,
  revealOpen: false,
  packsReadAt: persistedSeen.packsReadAt ?? 0,
  albumReadAt: persistedSeen.albumReadAt ?? 0,
  packsNewSince: 0,
  albumNewSince: 0,
};

function createCardsSignalStore(): CardsSignalStore {
  const store = createSignalStore();
  const tab = store.atom<CardsTab>("cardsTab", DEFAULT_STATE.tab);
  const kind = store.atom<CardKind | null>("cardsKind", DEFAULT_STATE.kind);
  const rarity = store.atom<CardRarity | null>("cardsRarity", DEFAULT_STATE.rarity);
  const sort = store.atom<CardsSort>("cardsSort", DEFAULT_STATE.sort);
  const sortDir = store.atom<CardsSortDir>("cardsSortDir", DEFAULT_STATE.sortDir);
  const collectionSort = store.atom<CardsCollectionSort>(
    "cardsCollectionSort",
    DEFAULT_STATE.collectionSort
  );
  const collectionSortDir = store.atom<CardsSortDir>(
    "cardsCollectionSortDir",
    DEFAULT_STATE.collectionSortDir
  );
  const albumMode = store.atom<CardsAlbumMode>("cardsAlbumMode", DEFAULT_STATE.albumMode);
  const binderPage = store.atom<number>("cardsBinderPage", DEFAULT_STATE.binderPage);
  const revealOpen = store.atom<boolean>("cardsRevealOpen", DEFAULT_STATE.revealOpen);
  const packsReadAt = store.atom<number>("cardsPacksReadAt", DEFAULT_STATE.packsReadAt);
  const albumReadAt = store.atom<number>("cardsAlbumReadAt", DEFAULT_STATE.albumReadAt);
  const packsNewSince = store.atom<number>("cardsPacksNewSince", DEFAULT_STATE.packsNewSince);
  const albumNewSince = store.atom<number>("cardsAlbumNewSince", DEFAULT_STATE.albumNewSince);

  const persistSort = () => {
    const state: SortState = {
      sort: sort.get(),
      sortDir: sortDir.get(),
      collectionSort: collectionSort.get(),
      collectionSortDir: collectionSortDir.get(),
    };
    attemptSync(() => localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(state)));
  };

  const persistSeen = () => {
    const state: SeenState = {
      packsReadAt: packsReadAt.get(),
      albumReadAt: albumReadAt.get(),
    };
    attemptSync(() => localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(state)));
  };

  return {
    atoms: {
      tab,
      kind,
      rarity,
      sort,
      sortDir,
      collectionSort,
      collectionSortDir,
      albumMode,
      binderPage,
      revealOpen,
      packsReadAt,
      albumReadAt,
      packsNewSince,
      albumNewSince,
    },
    setTab: (value) => tab.set(value),
    setKind: (value) => {
      kind.set(value);
      binderPage.set(0);
    },
    setRarity: (value) => {
      rarity.set(value);
      binderPage.set(0);
    },
    setSort: (value) => {
      sort.set(value);
      sortDir.set(DEFAULT_SORT_DIR[value]);
      binderPage.set(0);
      persistSort();
    },
    setSortDir: (value) => {
      sortDir.set(value);
      binderPage.set(0);
      persistSort();
    },
    setCollectionSort: (value) => {
      collectionSort.set(value);
      collectionSortDir.set(DEFAULT_COLLECTION_SORT_DIR[value]);
      binderPage.set(0);
      persistSort();
    },
    setCollectionSortDir: (value) => {
      collectionSortDir.set(value);
      binderPage.set(0);
      persistSort();
    },
    setAlbumMode: (value) => {
      albumMode.set(value);
      kind.set(null);
      binderPage.set(0);
    },
    setBinderPage: (value) => binderPage.set(Math.max(0, value)),
    setRevealOpen: (value) => revealOpen.set(value),
    setPacksReadAt: (value) => {
      packsReadAt.set(value);
      persistSeen();
    },
    setAlbumReadAt: (value) => {
      albumReadAt.set(value);
      persistSeen();
    },
    setPacksNewSince: (value) => packsNewSince.set(value),
    setAlbumNewSince: (value) => albumNewSince.set(value),
    reset: () => {
      tab.set(DEFAULT_STATE.tab);
      kind.set(DEFAULT_STATE.kind);
      rarity.set(DEFAULT_STATE.rarity);
      sort.set("recent");
      sortDir.set(DEFAULT_SORT_DIR.recent);
      collectionSort.set("recent");
      collectionSortDir.set(DEFAULT_COLLECTION_SORT_DIR.recent);
      albumMode.set(DEFAULT_STATE.albumMode);
      binderPage.set(DEFAULT_STATE.binderPage);
      revealOpen.set(DEFAULT_STATE.revealOpen);
      packsReadAt.set(0);
      albumReadAt.set(0);
      packsNewSince.set(0);
      albumNewSince.set(0);
      persistSort();
      persistSeen();
    },
  };
}

const cards = createCardsSignalStore();

export const cardsAtoms = cards.atoms;
export const setCardsTab = cards.setTab;
export const setCardsKind = cards.setKind;
export const setCardsRarity = cards.setRarity;
export const setCardsSort = cards.setSort;
export const setCardsSortDir = cards.setSortDir;
export const setCardsCollectionSort = cards.setCollectionSort;
export const setCardsCollectionSortDir = cards.setCollectionSortDir;
export const setCardsAlbumMode = cards.setAlbumMode;
export const setCardsBinderPage = cards.setBinderPage;
export const setCardsRevealOpen = cards.setRevealOpen;
export const setCardsPacksReadAt = cards.setPacksReadAt;
export const setCardsAlbumReadAt = cards.setAlbumReadAt;
export const setCardsPacksNewSince = cards.setPacksNewSince;
export const setCardsAlbumNewSince = cards.setAlbumNewSince;
export const resetCardsStore = cards.reset;
