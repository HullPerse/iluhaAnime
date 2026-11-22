import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  mangaHistoryKey,
  mangaLibraryKey,
  mangaReadKeys,
  trackMangaOpen,
  trackMangaPosition,
} from "@/api/manga.api";
import type { MangaHit, MangaReaderInput } from "@/api/manga.api";

export function useReaderProgress({
  chapter,
  chapterKey,
  hit,
  count,
  mode,
  onResume,
}: {
  chapter: MangaReaderInput;
  chapterKey: string;
  hit: MangaHit;
  count: number;
  mode: string;
  onResume: (page: number, offset: number) => void;
}) {
  const client = useQueryClient();
  const [itemId, setItemId] = useState<string>();
  const [openError, setOpenError] = useState<boolean>(false);
  const opening = useRef<ReturnType<typeof trackMangaOpen> | null>(null);
  const recorded = useRef<boolean>(false);
  const { source, mangaId, chapterId } = chapter;
  const write = useMutation({
    mutationFn: trackMangaPosition,
    onSuccess: async (_, input) => {
      if (!input.read.length) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: mangaReadKeys(source, mangaId) }),
        client.invalidateQueries({ queryKey: mangaLibraryKey }),
      ]);
    },
  });

  const { mutate: persist, error } = write;

  useEffect(() => {
    if (!count) return;
    let mounted = true;
    opening.current ??= trackMangaOpen({ source, hit, chapterId, chapterKey });
    opening.current
      .then((state) => {
        if (!mounted) return;
        recorded.current = state.readKeys.includes(chapterKey);
        onResume(Math.max(0, Math.min(state.page, count - 1)), state.scrollOffset);
        setItemId(state.id);

        return client.invalidateQueries({ queryKey: mangaHistoryKey });
      })
      .catch(() => {
        if (mounted) setOpenError(true);
      });

    return () => {
      mounted = false;
    };
  }, [chapterId, chapterKey, client, count, hit, onResume, source]);

  return {
    ready: itemId !== undefined || openError,
    failed: openError || error !== null,
    save(page: number, offset: number, read: string[] = []) {
      if (!itemId || count === 0) return;
      const pending = recorded.current ? [] : read;

      if (pending.length > 0) recorded.current = true;
      persist(
        {
          id: itemId,
          chapterId,
          chapterKey,
          page,
          pageCount: count,
          scrollOffset: offset,
          mode,
          at: Date.now(),
          read: pending,
        },
        {
          onError: () => {
            if (pending.length > 0) recorded.current = false;
          },
        }
      );
    },
  };
}
