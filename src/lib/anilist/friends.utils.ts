import { PROFILE_CACHE_TTL_MS } from "@/config/anilist/friends.config";
import type { AniFriend } from "@/types/anilist";

export function hasFreshCachedProfile(friend: AniFriend | undefined): boolean {
  return (
    !!friend?.profile &&
    typeof friend.profile_fetched_at === "number" &&
    Date.now() - (friend.profile_fetched_at as number) < PROFILE_CACHE_TTL_MS
  );
}
