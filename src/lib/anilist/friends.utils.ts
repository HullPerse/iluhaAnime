import { anilistApi } from "@/api/anilist.api";
import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import { parseScoreFormat } from "@/lib/anilist/score.utils";
import type { AniFriend, FriendScore } from "@/types/anilist";

export async function loadFriendScores(
  animeId: number,
  friends: FriendScore[]
): Promise<FriendScore[]> {
  if (friends.length === 0) return [];
  const rows = await anilistApi.getFriendScores(
    animeId,
    friends.map((friend) => friend.id)
  );
  const friendById = new Map(friends.map((friend) => [friend.id, friend]));
  return rows.flatMap((row) => {
    const friend = friendById.get(row.userId);
    if (!friend) return [];
    const comment = row.notes?.trim();
    return [
      {
        ...friend,
        score: row.score,
        scoreFormat: parseScoreFormat(row.scoreFormat),
        status: row.status ?? "",
        comment: comment ? comment : null,
        repeat: row.repeat,
        progress: row.progress,
        episodes: row.episodes,
      },
    ];
  });
}

export function hasFreshCachedProfile(friend: AniFriend | undefined): boolean {
  return (
    !!friend?.profile &&
    typeof friend.profile_fetched_at === "number" &&
    Date.now() - (friend.profile_fetched_at as number) < PROFILE_CACHE_TTL_MS
  );
}
