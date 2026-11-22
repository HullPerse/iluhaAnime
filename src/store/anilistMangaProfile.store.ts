import { createSignalStore } from "@hullperse/hp_utils/signal";
import type { AnilistSearchParams } from "@/api/anilist.api";

const store = createSignalStore();

export const query = store.atom("anilist.manga.search", "");

export const search = store.atom("anilist.manga.searchActive", false);

export const filters = store.atom<AnilistSearchParams>("anilist.manga.filters", {});

export const page = store.atom("anilist.manga.page", 1);

export const filterOpen = store.atom("anilist.manga.filterOpen", false);

export const account = store.atom("anilist.manga.account", "");

export const section = store.atom<"lists" | "favourites" | "stats" | "activity">(
  "anilist.manga.section",
  "lists"
);

export const listStatus = store.atom("anilist.manga.status", "");
