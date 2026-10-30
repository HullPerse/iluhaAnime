import { anilistApi } from "@/api/anilist.api";
import { useAppInfiniteQuery } from "@/hooks/appQuery.hook";
import { queryKeys } from "@/lib/core/keys.utils";

export function useStaffPage(
  key: string,
  id: number,
  list: "characters" | "media",
  pageParamName: "page" | "charPage",
  pageSize: number
) {
  return useAppInfiniteQuery("slow", {
    queryKey: queryKeys.staffDetail(id, key),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      anilistApi.getStaffCharacters(
        id,
        pageParamName === "page" ? pageParam : 1,
        pageParamName === "charPage" ? pageParam : 1
      ),
    getNextPageParam: (lastPage, pages) =>
      (Array.isArray(lastPage?.[list]) ? lastPage[list].length : 0) < pageSize
        ? undefined
        : pages.length + 1,
  });
}

export type StaffPage = ReturnType<typeof useStaffPage>;
