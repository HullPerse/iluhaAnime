import { createSignalStore } from "@hullperse/hp_utils/signal";

import type { MangaPersonSearch, MangaSource } from "@/api/manga.api";

import type { LibrarySortKey } from "@/types/manga/library";

const store = createSignalStore();
export const mangaAutoRunning = store.atom("manga.reader.autoRunning", false);
export const mangaLibraryFilter = store.atom<string>("manga.library.filter", "");
export const mangaLibraryStatus = store.atom<string>("manga.library.status", "");

export const librarySort = store.atom<{ key: LibrarySortKey; dir: "asc" | "desc" }>(
  "manga.library.sort",
  {
    key: "lastRead",
    dir: "desc",
  }
);

export const mangaSection = store.atom<"library" | "search" | "history" | "sources">(
  "manga.section",
  "library"
);
export const mangaQuery = store.atom("manga.query", "");
export const mangaSearchDraft = store.atom("manga.searchDraft", "");
export const mangaSearchHistory = store.atom<string[]>("manga.searchHistory", []);
export const mangaSearchSource = store.atom<MangaSource | null>("manga.source", null);
export const mangaSearchPage = store.atom("manga.page", 1);
export const mangaSearchPerson = store.atom<MangaPersonSearch | null>("manga.searchPerson", null);
export const mangaDetail = store.atom<{
  source: MangaSource;
  id: string;
  title: string;
  chapterKey?: string;
  chapterId?: string;
} | null>("manga.detail", null);

export function searchLocalManga(query: string, person?: MangaPersonSearch) {
  const value = query.trim();
  mangaSearchSource.set(null);
  mangaSearchPage.set(1);
  mangaSearchPerson.set(person ?? null);
  mangaSearchDraft.set(value);
  mangaQuery.set(value);
  mangaSection.set("search");
}
