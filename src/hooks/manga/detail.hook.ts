import { useCell } from "@hullperse/hp_utils/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getMangaCachedDetails, mangaLibraryKey, refreshMangaChapters } from "@/api/manga.api";
import type { MangaSource } from "@/api/manga.api";
import { QUERY_PRESETS } from "@/config/system/query.config";
import { settingsAtoms } from "@/store/settings.store";

export function useMangaDetailData(source: MangaSource, id: string, nsfw: boolean) {
  const client = useQueryClient();
  const requestDomain = useCell(settingsAtoms.mangaLibRequestDomain);
  const detailsKey = [
    "manga",
    "details",
    source,
    id,
    nsfw,
    source === "mangalib" ? requestDomain : null,
  ] as const;
  const cachedKey = ["manga", "cached", source, id] as const;
  const cached = useQuery({
    queryKey: cachedKey,
    queryFn: () => getMangaCachedDetails(source, id),
    ...QUERY_PRESETS.static,
    retry: false,
  });
  const fresh = useQuery({
    queryKey: detailsKey,
    queryFn: async () => {
      const result = await refreshMangaChapters(source, id, nsfw);
      client.setQueryData(cachedKey, result);
      await client.invalidateQueries({ queryKey: mangaLibraryKey });

      return result;
    },
    ...QUERY_PRESETS.slow,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () => refreshMangaChapters(source, id, nsfw),
    onSuccess: async (result) => {
      client.setQueryData(detailsKey, result);
      client.setQueryData(cachedKey, result);
      await client.invalidateQueries({ queryKey: mangaLibraryKey });
    },
  });
  const data = fresh.data ?? cached.data ?? undefined;

  return {
    data,
    error: fresh.error,
    isPending: !data && (fresh.isPending || cached.isPending),
    refetch: fresh.refetch,
    refresh,
  };
}
