import { useCell } from "@hullperse/hp_utils/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchMangaPage, openMangaChapter } from "@/api/manga.api";
import type { MangaReaderInput } from "@/api/manga.api";
import { activeMangaServer } from "@/config/manga/reader.config";
import { manifestKey, pageKey } from "@/lib/manga/readerQuery.utils";
import { settingsAtoms } from "@/store/settings.store";

export function useMangaPreload(
  data: { key: string; count: number } | undefined,
  page: number,
  nextChapter: MangaReaderInput | undefined
) {
  const queryClient = useQueryClient();
  const preload = useCell(settingsAtoms.mangaPreload);

  useEffect(() => {
    if (!data) return;
    const depth = Math.max(0, Math.min(6, Math.trunc(preload)));
    const preloadPages = (manifest: string, start: number, end: number) => {
      for (let index = start; index < end; index += 1) {
        queryClient.prefetchQuery({
          queryKey: pageKey(manifest, index),
          queryFn: () => fetchMangaPage(manifest, index),
          staleTime: 120_000,
          gcTime: 30_000,
          retry: false,
        });
      }
    };

    preloadPages(data.key, page + 1, Math.min(page + 1 + depth, data.count));
    const remaining = page + 1 + depth - data.count;

    if (remaining <= 0 || !nextChapter) return;
    let active = true;
    const prefetchNext = async () => {
      const manifest = await queryClient.fetchQuery({
        queryKey: manifestKey(nextChapter, activeMangaServer),
        queryFn: () => openMangaChapter(nextChapter, activeMangaServer),
        staleTime: 60_000,
        retry: false,
      });

      if (active) preloadPages(manifest.key, 0, Math.min(remaining, manifest.count));
    };

    prefetchNext().catch(() => undefined);

    return () => {
      active = false;
    };
  }, [data, nextChapter, page, preload, queryClient]);
}
