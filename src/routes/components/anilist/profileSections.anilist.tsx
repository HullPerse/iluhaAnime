import { useMemo } from "react";

import { listStatusLabels } from "@/config/anilist/labels.config";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { ALL_LISTS_ID, collectAllEntries } from "@/lib/anilist/group.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import AniListFriendHeader from "@/routes/components/anilist/friend/header.friend";
import AniListListsRow from "@/routes/components/anilist/lists.anilist";
import AniListSortBar from "@/routes/components/anilist/sort.anilist";
import AniListProfileHeader from "@/routes/components/anilist/user/header.user";
import type { AniListEntry, AniListSort, AniListSource } from "@/types/anilist";

export default function AniListProfileSections({
  source,
  isLoading,
  isLocal,
  global,
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
  onBackToSelf,
}: {
  source: AniListSource;
  isLoading: boolean;
  isLocal: boolean;
  global: boolean;
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
  onBackToSelf: () => void;
}) {
  const { t } = useI18n();
  const { caps, friend, friendProfile, lists, mode, user } = source;
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
    tabs.unshift({
      id: ALL_LISTS_ID,
      label: `${t("anilist.lists.all")} (${allCount})`,
      color: null,
    });
    return tabs;
  }, [lists, searchTerms, global, t]);
  return (
    <>
      {showProfile &&
        (mode === "friend" && friend ? (
          <AniListFriendHeader
            friend={friend}
            profile={friendProfile}
            loadingList={isLoading}
            onBack={onBackToSelf}
          />
        ) : (
          user && (
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
          )
        ))}

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
          showActions={caps.listActions}
        />
      )}
    </>
  );
}
