import type { RandomDiscovery } from "@/hooks/anilist/discovery.hook";
import { buildEntryLookup } from "@/lib/entries.utils";
import ActivityHistoryModal from "@/routes/components/anilist/activity.anilist";
import Auth from "@/routes/components/anilist/auth.anilist";
import BrowseAnimeModal from "@/routes/components/anilist/browse.anilist";
import AniListFavouritesModal from "@/routes/components/anilist/favourites.anilist";
import FiltersModal from "@/routes/components/anilist/filters.anilist";
import AniListFriendsModal from "@/routes/components/anilist/friends.anilist";
import PrefetchRelationsModal from "@/routes/components/anilist/prefetch/modal.prefetch";
import AniListRecsModal from "@/routes/components/anilist/rec.anilist";
import StatsModal from "@/routes/components/anilist/stats.anilist";
import type { AnilistScoreFormat } from "@/lib/anilistScore.utils";
import type {
  ActivityDetailBundle,
  AniFriend,
  AniFriendMinimal,
  AniListCollection,
  AniListFilters,
  AniListModalViews,
  AniRecommendation,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
  FavouritePeople,
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
  selfUser,
  scoreFormat,
  activityTab,
  onActivityClose,
  activityDetail,
  friends,
  onAddFriend,
  onAddManyFriends,
  onRemoveFriend,
  onViewFriendLists,
  onFriendsClose,
  favourites,
  onFavouritesClose,
  onFavouritesAnime,
  people,
  isLoggedIn,
  favouriteStaffIds,
  favouriteCharacterIds,
  onStaffFavouriteToggle,
  onCharacterFavouriteToggle,
  filters,
  isLocalFilters,
  onFiltersApply,
  onFiltersReset,
  onFiltersClose,
  onFiltersRandom,
  randomPending,
  discovery,
  onStatsClose,
  onBrowseClose,
  animeIds,
  onPrefetchClose,
  detail,
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
  selfUser: AniUser | null;
  scoreFormat: AnilistScoreFormat;
  activityTab: "feed" | "calendar" | "notifications" | "mentions" | "airing";
  onActivityClose: () => void;
  activityDetail: ActivityDetailBundle;
  friends: AniFriend[];
  onAddFriend: (profile: AniUserProfile) => void;
  onAddManyFriends: (friends: AniFriendMinimal[]) => void;
  onRemoveFriend: (id: number) => void;
  onViewFriendLists: (friend: AniFriend) => void;
  onFriendsClose: () => void;
  favourites: FavouriteAnime[];
  onFavouritesClose: () => void;
  onFavouritesAnime: (id: number) => void;
  people: FavouritePeople;
  isLoggedIn: boolean;
  favouriteStaffIds: Set<number>;
  favouriteCharacterIds: Set<number>;
  onStaffFavouriteToggle: (id: number) => void;
  onCharacterFavouriteToggle: (id: number) => void;
  filters: AniListFilters;
  isLocalFilters: boolean;
  onFiltersApply: (filters: AniListFilters) => void;
  onFiltersReset: () => void;
  onFiltersClose: () => void;
  onFiltersRandom: (filters: AniListFilters) => void;
  randomPending: boolean;
  discovery: RandomDiscovery;
  onStatsClose: () => void;
  onBrowseClose: () => void;
  animeIds: number[];
  onPrefetchClose: () => void;
  detail: ActivityDetailBundle;
}) {
  const watchedIds = new Set<number>();
  for (const collection of lists) {
    for (const entry of collection.entries) {
      if (entry.list_status === "COMPLETED") watchedIds.add(entry.media.id);
    }
  }

  return (
    <>
      {views.auth && <Auth onAuth={onAuthSuccess} onClose={onAuthClose} />}

      <AniListRecsModal
        open={views.recs}
        loading={views.recsLoading}
        recommendations={recs}
        watchedIds={watchedIds}
        onClose={onRecsClose}
        onAnimeClick={onRecsAnime}
      />

      {views.activity && userId != null && (
        <ActivityHistoryModal
          userId={userId}
          userName={selfUser?.name ?? null}
          friendIds={friendIds}
          lists={lists}
          initialTab={activityTab}
          onClose={onActivityClose}
          detail={activityDetail}
        />
      )}

      {views.friends && (
        <AniListFriendsModal
          friends={friends}
          selfUser={selfUser}
          selfLists={lists}
          selfFavourites={favourites}
          onAdd={onAddFriend}
          onAddMany={onAddManyFriends}
          onRemove={onRemoveFriend}
          onViewLists={onViewFriendLists}
          detail={detail}
          onClose={onFriendsClose}
        />
      )}

      <AniListFavouritesModal
        open={views.favourites}
        favourites={favourites}
        people={people}
        isLoggedIn={isLoggedIn}
        favouriteStaffIds={favouriteStaffIds}
        favouriteCharacterIds={favouriteCharacterIds}
        onStaffFavouriteToggle={onStaffFavouriteToggle}
        onCharacterFavouriteToggle={onCharacterFavouriteToggle}
        onClose={onFavouritesClose}
        onAnimeClick={onFavouritesAnime}
      />

      <FiltersModal
        open={views.filters}
        filters={filters}
        isLocal={isLocalFilters}
        onApply={onFiltersApply}
        onReset={onFiltersReset}
        onClose={onFiltersClose}
        onRandom={onFiltersRandom}
        randomPending={randomPending}
        discovery={discovery}
        entryLookup={entryLookup}
        detail={detail}
      />

      {views.stats && (
        <StatsModal
          lists={lists}
          userId={userId}
          scoreFormat={scoreFormat}
          onClose={onStatsClose}
          detail={detail}
        />
      )}

      {views.browse && (
        <BrowseAnimeModal entries={entryLookup} onClose={onBrowseClose} detail={detail} />
      )}

      {views.prefetch && <PrefetchRelationsModal animeIds={animeIds} onClose={onPrefetchClose} />}
    </>
  );
}
