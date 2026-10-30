import { useFriendCompare } from "@/hooks/friendCompare.hook";
import type {
  AniFriend,
  AniListCollection,
  AniUser,
  AniUserProfile,
  FavouriteAnime,
} from "@/types/anilist/anilist";

import CompareAnilist from "@/routes/components/anilist/compare.anilist";

export function ComparePanel({
  friend,
  profile,
  selfUser,
  selfLists,
  selfFavourites,
  onAnimeClick,
}: {
  friend: AniFriend;
  profile: AniUserProfile | undefined;
  selfUser: AniUser | null;
  selfLists: AniListCollection[];
  selfFavourites: FavouriteAnime[];
  onAnimeClick?: (id: number) => void;
}) {
  const { friendLists, friendFavourites, listsLoading, listsError, retry } = useFriendCompare(
    friend.id,
    true
  );
  return (
    <CompareAnilist
      selfUser={selfUser}
      selfLists={selfLists}
      selfFavourites={selfFavourites}
      friendProfile={profile ?? friend.profile ?? null}
      friendName={friend.name}
      friendLists={friendLists}
      friendFavourites={friendFavourites}
      listsLoading={listsLoading}
      listsError={listsError}
      onRetry={retry}
      onAnimeClick={onAnimeClick}
    />
  );
}
