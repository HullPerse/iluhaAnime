import { useMemo, useState } from "react";

import { anilistApi } from "@/api/anilist.api";
import { TabLoader } from "@/components/shared/loader/tab.loader";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { isMentionOf } from "@/lib/core/activity.utils";
import { queryKeys } from "@/lib/core/keys.utils";

import { FeedItem } from "@/routes/components/anilist/activity/feedItem.activity";

export function MentionsTab({
  userId,
  userName,
  friendIds,
  onAnimeClick,
}: {
  userId: number;
  userName: string | null;
  friendIds: number[];
  onAnimeClick: (id: number) => void;
}) {
  const { t } = useI18n();
  const [includeFriends, setIncludeFriends] = useState<boolean>(false);
  const activityUserIds = useMemo(() => {
    const ids = includeFriends ? [userId, ...friendIds] : [userId];
    return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
  }, [friendIds, includeFriends, userId]);

  const { data, isLoading, isError, error, refetch } = useAppQuery("slow", {
    queryKey: queryKeys.activity(activityUserIds),
    queryFn: () => anilistApi.getActivity(activityUserIds),
    enabled: userId > 0,
    placeholderData: (previous) => previous,
  });

  const mentions = useMemo(
    () =>
      (data ?? []).filter((a) => a.activity_type === "text" && isMentionOf(a.text, userName ?? "")),
    [data, userName]
  );

  if (isLoading) {
    return <TabLoader className="flex-1 p-6" />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center">
          {t("anilist.activity.load.error", {
            error: String(error ?? t("anilist.activity.unknown.error")),
          })}
        </span>
        <Button onClick={() => refetch()} className="text-xs">
          {t("anilist.activity.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {friendIds.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <label className="windows95-text ml-auto flex items-center gap-1 text-xs select-none">
            <Checkbox checked={includeFriends} onChange={setIncludeFriends} />
            {t("anilist.activity.include.friends")}
          </label>
        </div>
      )}
      {mentions.length === 0 ? (
        <div className="flex items-center justify-center p-4">
          <span className="windows95-text text-hint text-xs">
            {t("anilist.activity.mentions.empty")}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {mentions.map((a) => (
            <FeedItem key={a.id} a={a} onAnimeClick={onAnimeClick} />
          ))}
        </div>
      )}
    </div>
  );
}
