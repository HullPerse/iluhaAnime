import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader/small.loader";
import { FRIEND_ACTIVITY_LIMIT } from "@/config/anilist/friendActivity.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/core/keys.utils";

import { FriendActivityRow } from "./friendActivity/row.friendActivity";

export function FriendActivityFeed({ friendId }: { friendId: number }) {
  const { t } = useI18n();
  const { data, isLoading } = useAppQuery("slow", {
    queryKey: queryKeys.activity([friendId]),
    queryFn: () => anilistApi.getActivity([friendId]),
    placeholderData: (previous) => previous,
  });
  if (isLoading) return <SmallLoader size={3} />;
  const activities = (data ?? []).slice(0, FRIEND_ACTIVITY_LIMIT);
  if (activities.length === 0) {
    return (
      <span className="windows95-text text-hint text-xs">{t("anilist.friends.no.activity")}</span>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="windows95-text text-hint text-xs">{t("anilist.friends.latest")}</span>
      <div className="mt-1 flex flex-col gap-1">
        {activities.map((activity) => (
          <FriendActivityRow key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
}
