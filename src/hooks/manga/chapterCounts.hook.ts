import { useQuery } from "@tanstack/react-query";

import { getMangaSearchMeta } from "@/api/manga.api";
import type { MangaHit, MangaSource } from "@/api/manga.api";

export function useMangaChapterCounts(source: MangaSource, hits: MangaHit[] | undefined) {
  const missing = (hits ?? []).filter((hit) => hit.chapters == null).map((hit) => hit.id);
  const counts = useQuery({
    queryKey: ["manga", "chapters", source, missing],
    queryFn: () => getMangaSearchMeta(source, missing),
    enabled: (source === "mangalib" || source === "mangadex") && missing.length > 0,
    staleTime: 10 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return new Map(counts.data?.map((row) => [row.id, row.chapters]));
}
