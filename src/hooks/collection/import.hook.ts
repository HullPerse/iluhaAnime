import { useCallback, useMemo, useState } from "react";

import { buildImportDiff } from "@/lib/core/collection/importDiff.utils";
import type { AniListCollection, AniListEntry } from "@/types/anilist/anilist";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";
import type { CollectionItem } from "@/types/anilist/collection";

export function useAnilistImportDiff({
  lists,
  items,
  scoreFormat,
}: {
  lists: AniListCollection[];
  items: CollectionItem[];
  scoreFormat: AnilistScoreFormat;
}) {
  return useMemo(
    () => buildImportDiff({ lists, items, scoreFormat }),
    [lists, items, scoreFormat]
  );
}

export function useImportSelection({
  newEntries,
  changedEntries,
}: {
  newEntries: AniListEntry[];
  changedEntries: AniListEntry[];
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const resetSelection = useCallback(() => setSelected(new Set()), []);

  const toggleOne = useCallback((id: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((entries: AniListEntry[]) => {
    const ids = entries.map((entry) => entry.media.id);
    setSelected((previous) => {
      const next = new Set(previous);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const selectedCount = selected.size;
  const selectedNew = newEntries.filter((entry) => selected.has(entry.media.id)).length;
  const allChangedSelected =
    changedEntries.length > 0 && changedEntries.every((entry) => selected.has(entry.media.id));

  return {
    selected,
    selectedCount,
    selectedNew,
    allChangedSelected,
    resetSelection,
    toggleOne,
    toggleAll,
  };
}
