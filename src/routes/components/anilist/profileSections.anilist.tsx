import { useMemo } from "react";

import Tabs from "@/components/shared/tabs.component";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import AniListProfileHeader from "@/routes/components/anilist/header.anilist";
import AniListSortBar from "@/routes/components/anilist/sort.anilist";
import type { AniListCollection, AniListSort, AniUser } from "@/types/anilist";

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
  onActivityFeed,
  onFavourites,
  onRandom,
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
  onSortChange: React.Dispatch<React.SetStateAction<AniListSort>>;
  hasFavourites: boolean;
  onActivityFeed: () => void;
  onFavourites: () => void;
  onRandom: () => void;
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
    return lists
      .filter((item) => item.entries.length > 0)
      .map((item) => {
        const count = item.entries.filter((e) => {
          if (!q || global) return true;
          return (
            e.media.title.toLowerCase().includes(q) ||
            e.media.titles.some((title) => title.toLowerCase().includes(q))
          );
        }).length;
        const label = t((listStatusLabels[item.name.toUpperCase()] ?? item.name) as never);
        return { id: item.name, label: `${label} (${count})` };
      });
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

      {!isLoading && showListBar && (
        <Tabs
          ariaLabel={t("anilist.lists.title")}
          tabs={listTabs}
          activeTab={currentList}
          onChange={onSelectList}
        />
      )}

      {showListBar && (
        <AniListSortBar
          sort={sort}
          onSortChange={onSortChange}
          onActivityOpen={onActivityFeed}
          onFavouritesOpen={onFavourites}
          onRandom={onRandom}
          hasFavourites={hasFavourites}
        />
      )}
    </>
  );
}
