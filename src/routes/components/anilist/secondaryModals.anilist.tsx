import { buildEntryLookup } from "@/lib/anilist/entries.utils";
import ActivityHistoryModal from "@/routes/components/anilist/activity.anilist";
import Auth from "@/routes/components/anilist/auth.anilist";
import BrowseAnimeModal from "@/routes/components/anilist/browse.anilist";
import AniListFavouritesModal from "@/routes/components/anilist/favourites.anilist";
import FiltersModal from "@/routes/components/anilist/filters.anilist";
import AniListFriendsModal from "@/routes/components/anilist/friends.anilist";
import PrefetchRelationsModal from "@/routes/components/anilist/prefetch/modal.prefetch";
import AniListRecsModal from "@/routes/components/anilist/rec.anilist";
import StatsModal from "@/routes/components/anilist/stats.anilist";
import type {
  AniFriend,
  AniListCollection,
  AniListFilters,
  AniListModalViews,
  AniRecommendation,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
} from "@/types/anilist";

export default function AniListSecondaryModals({
  entryLookup,
  views,
  onAuthSuccess,
  onAuthClose,
  recs,
  onRecsClose,
  onRecsAnime,
  userId,
  friendIds,
  lists,
  activityTab,
  onActivityClose,
  onActivityAnime,
  friends,
  onAddFriend,
  onRemoveFriend,
  onFriendsClose,
  favourites,
  onFavouritesClose,
  onFavouritesAnime,
  filters,
  onFiltersApply,
  onFiltersReset,
  onFiltersClose,
  onFiltersRandom,
  randomPending,
  onStatsClose,
  onStatsAnime,
  onBrowseClose,
  onBrowseAnime,
  animeIds,
  onPrefetchClose,
}: {
  entryLookup: ReturnType<typeof buildEntryLookup>;
  views: AniListModalViews;
  onAuthSuccess: (user: AniUser) => void;
  onAuthClose: () => void;
  recs: AniRecommendation[];
  onRecsClose: () => void;
  onRecsAnime: (id: number) => void;
  userId: number | null;
  friendIds: number[];
  lists: AniListCollection[];
  activityTab: "feed" | "calendar";
  onActivityClose: () => void;
  onActivityAnime: (id: number) => void;
  friends: AniFriend[];
  onAddFriend: (profile: AniUserProfile) => void;
  onRemoveFriend: (id: number) => void;
  onFriendsClose: () => void;
  favourites: FavouriteAnime[];
  onFavouritesClose: () => void;
  onFavouritesAnime: (id: number) => void;
  filters: AniListFilters;
  onFiltersApply: (filters: AniListFilters) => void;
  onFiltersReset: () => void;
  onFiltersClose: () => void;
  onFiltersRandom: (filters: AniListFilters) => void;
  randomPending: boolean;
  onStatsClose: () => void;
  onStatsAnime: (id: number) => void;
  onBrowseClose: () => void;
  onBrowseAnime: (id: number) => void;
  animeIds: number[];
  onPrefetchClose: () => void;
}) {
  return (
    <>
      {views.auth && <Auth onAuth={onAuthSuccess} onClose={onAuthClose} />}

      <AniListRecsModal
        open={views.recs}
        loading={views.recsLoading}
        recommendations={recs}
        onClose={onRecsClose}
        onAnimeClick={onRecsAnime}
      />

      {views.activity && userId != null && (
        <ActivityHistoryModal
          userId={userId}
          friendIds={friendIds}
          lists={lists}
          initialTab={activityTab}
          onClose={onActivityClose}
          onAnimeClick={onActivityAnime}
        />
      )}

      {views.friends && (
        <AniListFriendsModal
          friends={friends}
          onAdd={onAddFriend}
          onRemove={onRemoveFriend}
          onClose={onFriendsClose}
        />
      )}

      <AniListFavouritesModal
        open={views.favourites}
        favourites={favourites}
        onClose={onFavouritesClose}
        onAnimeClick={onFavouritesAnime}
      />

      <FiltersModal
        open={views.filters}
        filters={filters}
        onApply={onFiltersApply}
        onReset={onFiltersReset}
        onClose={onFiltersClose}
        onRandom={onFiltersRandom}
        randomPending={randomPending}
      />

      {views.stats && (
        <StatsModal lists={lists} onClose={onStatsClose} onAnimeClick={onStatsAnime} />
      )}

      {views.browse && (
        <BrowseAnimeModal
          entries={entryLookup}
          onClose={onBrowseClose}
          onAnimeClick={onBrowseAnime}
        />
      )}

      {views.prefetch && <PrefetchRelationsModal animeIds={animeIds} onClose={onPrefetchClose} />}
    </>
  );
}
