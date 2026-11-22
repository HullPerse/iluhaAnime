import { queryOptions } from "@tanstack/react-query";

import { searchManga } from "@/api/manga.api";
import type { MangaPersonSearch, MangaSource } from "@/api/manga.api";
import { settingsAtoms } from "@/store/settings.store";

export function catalogQuery(
  source: MangaSource,
  query: string,
  page: number,
  nsfw: boolean,
  person: MangaPersonSearch | null = null
) {
  return queryOptions({
    queryKey: [
      "manga",
      "catalog",
      source,
      query,
      page,
      nsfw,
      person?.role ?? null,
      person?.key ?? null,
      person?.source ?? null,
      source === "mangalib" ? settingsAtoms.mangaLibRequestDomain.get() : null,
    ],
    queryFn: () => searchManga(source, query, page, nsfw, person),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
