import { useMemo } from "react";

import { filterEntries, sortEntries } from "@/lib/anilist/entries.utils";
import { groupEntriesByList } from "@/lib/anilist/group.utils";
import type { AniListCollection, AniListGroup, AniListSort, AniUser } from "@/types/anilist";

export function useAnilistListView({
  lists,
  sort,
  searchTerms,
  groupByStatus,
  displayMode,
  collapsedNames,
  user,
  global,
}: {
  lists: AniListCollection[];
  sort: AniListSort;
  searchTerms: string;
  groupByStatus: boolean;
  displayMode: "scroll" | "pagination";
  collapsedNames: string[];
  user: AniUser | null;
  global: boolean;
}): {
  grouped: AniListGroup[] | null;
  collapsedLists: Set<string>;
  useScrollView: boolean;
  effectiveDisplayMode: "scroll" | "pagination";
} {
  const grouped = useMemo(() => {
    if (!groupByStatus || !user || global) return null;
    const flat = lists.flatMap((list) => list.entries);
    const filtered = filterEntries(flat, searchTerms, false);
    return groupEntriesByList(sortEntries(filtered, sort.dir, sort.key), lists);
  }, [groupByStatus, user, global, lists, searchTerms, sort]);
  const collapsedLists = useMemo(() => new Set(collapsedNames), [collapsedNames]);
  const useScrollView = grouped !== null || (displayMode === "scroll" && !!user && !global);
  const effectiveDisplayMode = grouped !== null ? "scroll" : displayMode;
  return { grouped, collapsedLists, useScrollView, effectiveDisplayMode };
}
