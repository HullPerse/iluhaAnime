import { sortAniMediaList, type sortEntries } from "@/lib/anilist/entries.utils";
import type { AniListAnime, AniListViewState, AniMedia, GlobalSort } from "@/types/anilist";

export function buildAnimeBackHandler(
  animeHistory: AniListAnime[],
  setAnimeHistory: React.Dispatch<React.SetStateAction<AniListAnime[]>>,
  setSelectedAnime: React.Dispatch<React.SetStateAction<AniListAnime>>
): (() => void) | undefined {
  if (animeHistory.length === 0) return undefined;
  return () => {
    const prev = animeHistory.at(-1);
    if (prev) {
      setAnimeHistory((h) => h.slice(0, -1));
      setSelectedAnime(prev);
    }
  };
}

export function pickDisplayEntries(
  global: boolean,
  searchResults: AniMedia[],
  sortedEntries: ReturnType<typeof sortEntries>,
  globalSort: GlobalSort
): AniMedia[] {
  if (global) return sortAniMediaList(searchResults, globalSort.key, globalSort.dir);
  return sortedEntries.map((e) => e.media);
}

export function isLocalSearch(searchTerms: string, global: boolean): boolean {
  return searchTerms.trim().length > 0 && !global;
}

export function resolveAniListView(params: {
  isLoading: boolean;
  hasLists: boolean;
  global: boolean;
  isLocal: boolean;
  hasUser: boolean;
  loadingSearch: boolean;
  hasSearchResults: boolean;
}): AniListViewState | null {
  if (params.isLoading && !params.hasLists) return "loading";
  if (params.global) {
    if (params.loadingSearch) return "globalLoading";
    if (!params.hasSearchResults) return "globalEmpty";
    return null;
  }
  if (params.isLocal) return "localEmpty";
  if (!params.hasUser) return "login";
  return null;
}
