import { createSignalStore } from "@hullperse/hp_utils/signal";

const store = createSignalStore();
export const anilistMangaMode = store.atom("anilist.mangaMode", false);
export const trackedManga = store.atom<{ id: number; title: string } | null>(
  "anilist.manga.detail",
  null
);

export function openTrackedManga(id: number, title: string) {
  trackedManga.set({ id, title });
  anilistMangaMode.set(true);
}
