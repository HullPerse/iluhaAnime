import { anilistApi } from "@/api/anilist.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";

// Returns null without request when no id; anilist_avatar is local-only.
export function usePeerAvatarUrl(anilistUserId: number | null): string | null {
  const userId = anilistUserId;
  const query = useAppQuery<string | null>("slow", {
    enabled: userId !== null,
    queryFn: async () => {
      if (userId === null) return null;
      try {
        const profile = await anilistApi.getProfile(userId);
        return typeof profile.avatar === "string" ? profile.avatar : null;
      } catch {
        return null;
      }
    },
    queryKey: queryKeys.peerAvatar(userId),
  });
  return query.data ?? null;
}
