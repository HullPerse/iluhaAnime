import { useEffect, useRef } from "react";

import { presenceAtoms } from "@/store/presence.store";

export function useMangaReadingPresence(title: string | undefined, chapter: string | undefined) {
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (title === undefined || chapter === undefined) {
      startedAt.current = null;
      presenceAtoms.reading.set(null);

      return;
    }

    startedAt.current ??= Date.now();
    presenceAtoms.reading.set({ title, chapter, startedAt: startedAt.current });
  }, [chapter, title]);

  useEffect(
    () => () => {
      startedAt.current = null;
      presenceAtoms.reading.set(null);
    },
    []
  );
}
