import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { AniFriend, AniListCollection, FriendScore } from "@/types/anilist";

export async function loadFriendScores(
  animeId: number,
  friends: FriendScore[]
): Promise<FriendScore[]> {
  const settled = await Promise.allSettled(
    friends.map((friend) =>
      invokeTyped<AniListCollection[]>("get_anilist_lists", {
        userId: friend.id,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }).then((lists) => {
        const entry = lists
          .flatMap((list) => list.entries)
          .find((item) => item.media.id === animeId);
        return entry ? { ...friend, score: entry.score, status: entry.list_status } : null;
      })
    )
  );
  const rows = settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
  if (rows.length === 0) {
    const failure = settled.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }
  return rows;
}

export function hasFreshCachedProfile(friend: AniFriend | undefined): boolean {
  return (
    !!friend?.profile &&
    typeof friend.profile_fetched_at === "number" &&
    Date.now() - (friend.profile_fetched_at as number) < PROFILE_CACHE_TTL_MS
  );
}
