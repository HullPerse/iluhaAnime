import { anilistApi } from "@/api/anilist.api";
import { useAppInfiniteQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import type { AniFriendMinimal } from "@/types/anilist";

const FOLLOWING_PER_PAGE = 25;

function messageOf(error: unknown): string | null {
  if (error == null) return null;
  return error instanceof Error ? error.message : String(error);
}

export function useAnilistFollowing(userId: number | null, enabled: boolean) {
  const query = useAppInfiniteQuery("slow", {
    queryKey: queryKeys.anilistFollowing(userId),
    enabled: enabled && userId != null,
    retry: 1,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      anilistApi.getFollowing(userId as number, pageParam, FOLLOWING_PER_PAGE),
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.has_next_page ? lastPageParam + 1 : undefined,
  });
  const users: AniFriendMinimal[] = (query.data?.pages ?? []).flatMap((page) => page.users);
  return {
    users,
    total: query.data?.pages[0]?.total ?? null,
    isLoading: query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage ?? false,
    error: messageOf(query.error),
    loadMore: () => {
      query.fetchNextPage().catch(() => {});
    },
    retry: () => {
      query.refetch().catch(() => {});
    },
  };
}
