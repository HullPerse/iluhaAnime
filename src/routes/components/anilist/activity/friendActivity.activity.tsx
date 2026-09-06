import { useQuery } from "@tanstack/react-query";

import { SmallLoader } from "@/components/shared/loader.component";
import { formatActivityTime } from "@/lib/anilist/activity.utils";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { AniActivity } from "@/types/anilist";

const STATUS_LABELS: Record<string, TranslationKey> = {
  CURRENT: "anilist.activity.status.CURRENT",
  COMPLETED: "anilist.activity.status.COMPLETED",
  DROPPED: "anilist.activity.status.DROPPED",
  PLANNING: "anilist.activity.status.PLANNING",
  PAUSED: "anilist.activity.status.PAUSED",
  REPEATING: "anilist.activity.status.REPEATING",
};

export function FriendLatestActivity({ friendId }: { friendId: number }) {
  const { t, locale } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["anilist_activity", [friendId]],
    queryFn: () => invokeTyped<AniActivity[]>("get_anilist_activity", { userIds: [friendId] }),
    staleTime: 60_000,
  });
  if (isLoading) return <SmallLoader size={3} />;
  const latest = (data ?? []).find((a) => a.activity_type === "list" && a.media_id != null);
  if (!latest) {
    return (
      <span className="windows95-text text-hint text-xs">{t("anilist.friends.no.activity")}</span>
    );
  }
  const statusKey = STATUS_LABELS[latest.status ?? ""];
  return (
    <div className="flex flex-col">
      <span className="windows95-text text-hint text-xs">{t("anilist.friends.latest")}</span>
      <span className="windows95-text truncate text-xs" title={latest.media_title ?? ""}>
        {statusKey ? t(statusKey) : latest.status} - {latest.media_title}
        {latest.progress ? ` (${latest.progress})` : ""}
      </span>
      <span className="windows95-text text-hint text-xs">
        {formatActivityTime(latest.created_at, t, locale)}
      </span>
    </div>
  );
}
