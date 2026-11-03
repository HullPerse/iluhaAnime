import { useCallback, useState } from "react";

import type { LocalMediaFilter } from "@/lib/anilist/entries.utils";

export function useAnilistLocalFilter({
  global,
  onTag,
  onStudio,
}: {
  global: boolean;
  onTag: (value: string) => void;
  onStudio: (id: number, name: string) => void;
}) {
  const [filter, setFilter] = useState<LocalMediaFilter | null>(null);

  const selectTag = useCallback(
    (value: string) => {
      if (global) onTag(value);
      else setFilter({ kind: "tag", value });
    },
    [global, onTag]
  );

  const selectStudio = useCallback(
    (id: number, name: string) => {
      if (global) onStudio(id, name);
      else setFilter({ kind: "studio", id, value: name });
    },
    [global, onStudio]
  );

  const clear = useCallback(() => setFilter(null), []);

  const searchGlobally = useCallback(() => {
    if (!filter) return;
    if (filter.kind === "tag") onTag(filter.value);
    else onStudio(filter.id ?? 0, filter.value);
    setFilter(null);
  }, [filter, onStudio, onTag]);

  return { filter, selectTag, selectStudio, clear, searchGlobally };
}
