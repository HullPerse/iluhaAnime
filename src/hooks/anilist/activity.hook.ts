import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

import { anilistApi } from "@/api/anilist.api";
import { tr } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { ActivityLikeState, AniActivity } from "@/types/anilist";

export function useToggleActivityLike() {
  const queryClient = useQueryClient();
  const pendingRef = useRef<Set<number>>(new Set());

  return async (activity: AniActivity) => {
    if (pendingRef.current.has(activity.id)) return;
    pendingRef.current.add(activity.id);
    const next: ActivityLikeState = {
      like_count: activity.is_liked
        ? Math.max(0, activity.like_count - 1)
        : activity.like_count + 1,
      is_liked: !activity.is_liked,
    };
    queryClient.setQueriesData<AniActivity[]>({ queryKey: ["anilist_activity"] }, (old) =>
      old?.map((item) =>
        item.id === activity.id
          ? { ...item, like_count: next.like_count, is_liked: next.is_liked }
          : item
      )
    );
    const [state, error] = await attempt(anilistApi.toggleActivityLike(activity.id));
    pendingRef.current.delete(activity.id);
    if (error) {
      queryClient.setQueriesData<AniActivity[]>({ queryKey: ["anilist_activity"] }, (old) =>
        old?.map((item) =>
          item.id === activity.id
            ? { ...item, like_count: activity.like_count, is_liked: activity.is_liked }
            : item
        )
      );
      useNotificationStore
        .getState()
        .add(tr("anilist.activity.like.failed"), "error", error.message);
    } else if (state) {
      queryClient.setQueriesData<AniActivity[]>({ queryKey: ["anilist_activity"] }, (old) =>
        old?.map((item) =>
          item.id === activity.id
            ? { ...item, like_count: state.like_count, is_liked: state.is_liked }
            : item
        )
      );
    }
  };
}
