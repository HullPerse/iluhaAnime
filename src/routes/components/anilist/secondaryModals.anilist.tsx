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
  activityTab,
  onActivityClose,
  onActivityAnime,
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
  selfUser: AniUser | null;
  activityTab: "feed" | "calendar";
  onActivityClose: () => void;
  onActivityAnime: (id: number) => void;
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
          selfUser={selfUser}
          selfLists={lists}
          selfFavourites={favourites}
          onAdd={onAddFriend}
          onAddMany={onAddManyFriends}
          onRemove={onRemoveFriend}
          onViewLists={onViewFriendLists}
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
