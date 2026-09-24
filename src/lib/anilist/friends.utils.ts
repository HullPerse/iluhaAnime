import { anilistApi } from "@/api/anilist.api";
import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import { parseScoreFormat } from "@/lib/anilist/score.utils";
import type { AniFriend, FriendScore } from "@/types/anilist";

export async function loadFriendScores(
  animeId: number,
  friends: FriendScore[]
): Promise<FriendScore[]> {
  const settled = await Promise.allSettled(
    friends.map((friend) =>
      Promise.all([
        anilistApi.getLists(friend.id),
        anilistApi.getProfile(friend.id).catch(() => null),
      ]).then(([lists, profile]) => {
        const entry = lists
          .flatMap((list) => list.entries)
          .find((item) => item.media.id === animeId);
        if (!entry) return null;
        const trimmed = entry.notes?.trim();
        return {
          ...friend,
          score: entry.score,
          scoreFormat: parseScoreFormat(profile?.score_format),
          status: entry.list_status,
          comment: trimmed ? trimmed : null,
          repeat: entry.repeat,
          progress: entry.progress,
          episodes: entry.media.episodes,
        };
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
