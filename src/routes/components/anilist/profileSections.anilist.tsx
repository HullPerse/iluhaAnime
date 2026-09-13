import { useMemo } from "react";

import { ALL_LISTS_ID, collectAllEntries } from "@/lib/anilist/group.utils";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import AniListListsRow from "@/routes/components/anilist/lists.anilist";
import AniListProfileHeader from "@/routes/components/anilist/header.anilist";
import AniListSortBar from "@/routes/components/anilist/sort.anilist";
import type { AniListCollection, AniListEntry, AniListSort, AniUser } from "@/types/anilist";

export default function AniListProfileSections({
  user,
  isLoading,
  isLocal,
  global,
  lists,
  currentList,
  onSelectList,
  searchTerms,
  sort,
  onSortChange,
  hasFavourites,
  grouped,
  groupByStatus,
  onGroupChange,
  displayMode,
  onDisplayChange,
  onActivityFeed,
  onFavourites,
  onRandom,
  onSpotlight,
  onStats,
  onBrowse,
  onRecs,
  onPrefetch,
  onFriends,
  onLogout,
}: {
  user: AniUser | null;
  isLoading: boolean;
  isLocal: boolean;
  global: boolean;
  lists: AniListCollection[];
  currentList: string;
  onSelectList: (name: string) => void;
  searchTerms: string;
  sort: AniListSort;
  onSortChange: (sort: AniListSort) => void;
  hasFavourites: boolean;
  grouped: boolean;
  groupByStatus: boolean;
  onGroupChange: (grouped: boolean) => void;
  displayMode: "scroll" | "pagination";
  onDisplayChange: (mode: "scroll" | "pagination") => void;
  onActivityFeed: () => void;
  onFavourites: () => void;
  onRandom: () => void;
  onSpotlight: () => void;
  onStats: () => void;
  onBrowse: () => void;
  onRecs: () => void;
  onPrefetch: () => void;
  onFriends: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const showProfile = !!user && !global && !isLocal;
  const showListBar = !!user && !global && lists.length > 0;
  const listTabs = useMemo(() => {
    const q = searchTerms.trim().toLowerCase();
    const matches = (e: AniListEntry) =>
      !q ||
      global ||
      e.media.title.toLowerCase().includes(q) ||
      e.media.titles.some((title) => title.toLowerCase().includes(q));
    const tabs: { id: string; label: string; color: string | null }[] = lists
      .filter((item) => item.entries.length > 0)
      .map((item) => {
        const label = t(toLocaleKey(listStatusLabels[item.name.toUpperCase()] ?? item.name));
        const color = getStatusColor(item.name.toUpperCase());
        return { id: item.name, label: `${label} (${item.entries.filter(matches).length})`, color };
      });
    const allCount = collectAllEntries(lists).filter(matches).length;
    tabs.unshift({ id: ALL_LISTS_ID, label: `${t("anilist.lists.all")} (${allCount})`, color: null });
    return tabs;
  }, [lists, searchTerms, global, t]);
  return (
    <>
      {showProfile && (
        <AniListProfileHeader
          user={user}
          loadingList={isLoading}
          onStatsOpen={onStats}
          onBrowseOpen={onBrowse}
          onRecsOpen={onRecs}
          onPrefetchOpen={onPrefetch}
          onFriendsOpen={onFriends}
          onLogout={onLogout}
        />
      )}

      {!isLoading && showListBar && !grouped && (
        <AniListListsRow tabs={listTabs} activeTab={currentList} onChange={onSelectList} />
      )}

      {showListBar && (
        <AniListSortBar
          sort={sort}
          onSortChange={onSortChange}
          onActivityOpen={onActivityFeed}
          onFavouritesOpen={onFavourites}
          onRandom={onRandom}
          onSpotlight={onSpotlight}
          hasFavourites={hasFavourites}
          groupByStatus={groupByStatus}
          onGroupChange={onGroupChange}
          displayMode={displayMode}
          onDisplayChange={onDisplayChange}
        />
      )}
    </>
  );
}
