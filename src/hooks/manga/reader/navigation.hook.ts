import { useCallback, useEffect, useRef, useState } from "react";
import type { MangaChapter } from "@/api/manga.api";
import { mangaAutoRunning } from "@/store/manga.store";

type Location = { chapter: MangaChapter; page?: number };

export function useReaderNavigation() {
  const [location, setLocation] = useState<Location | null>(null);
  const journal = useRef<Location[]>([]);
  const index = useRef(-1);
  const [token, setToken] = useState(0);
  useEffect(() => () => mangaAutoRunning.set(false), []);

  const show = useCallback((next: Location) => {
    setLocation({ ...next });
    setToken((value) => value + 1);
  }, []);

  const visit = useCallback(
    (chapter: MangaChapter | null, page?: number) => {
      if (!chapter) {
        mangaAutoRunning.set(false);
        journal.current = [];
        index.current = -1;
        setLocation(null);

        return;
      }

      const next = { chapter, page };
      journal.current = [...journal.current.slice(0, index.current + 1), next].slice(-200);
      index.current = journal.current.length - 1;
      show(next);
    },
    [show]
  );

  return {
    chapter: location?.chapter ?? null,
    page: location?.page,
    token,
    visit,
    position(page: number) {
      const current = journal.current[index.current];

      if (current) current.page = page;
    },
    move(delta: number) {
      const target = index.current + delta;
      const next = journal.current[target];

      if (!next) return;
      index.current = target;
      show(next);
    },
  };
}
