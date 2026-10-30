import { MessageSquare } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { ACTIVITY_STATUS_ICONS, ACTIVITY_STATUS_LABELS } from "@/config/anilist/activity.config";
import { useI18n } from "@/hooks/i18n.hook";
import { formatActivityTime } from "@/lib/core/activity.utils";
import type { AniActivity } from "@/types/anilist/anilist";

import { ActivityLikeButton } from "@/routes/components/anilist/activity/like.activity";

export function FriendActivityRow({ activity }: { activity: AniActivity }) {
  const { t, locale } = useI18n();
  const time = formatActivityTime(activity.created_at, locale);

  if (activity.activity_type !== "list" || activity.media_id == null) {
    return (
      <div className="windows95-border bg-primary flex items-start gap-1 px-1 py-0.5">
        <MessageSquare className="text-hint mt-0.5 size-3 shrink-0" />
        <span
          className="windows95-text line-clamp-2 min-w-0 flex-1 text-xs"
          title={activity.text ?? ""}
        >
          {activity.text}
        </span>
        <ActivityLikeButton activity={activity} />
        <span className="text-hint windows95-font shrink-0 text-xs">{time}</span>
      </div>
    );
  }

  const Icon = ACTIVITY_STATUS_ICONS[activity.status ?? ""];
  const statusKey = ACTIVITY_STATUS_LABELS[activity.status ?? ""];
  return (
    <div className="windows95-border bg-primary flex items-center gap-1 px-1 py-0.5">
      {activity.media_cover && (
        <ImageComponent
          src={activity.media_cover}
          alt=""
          className="windows95-active-border h-8 w-6 shrink-0 object-cover"
        />
      )}
      <div className="windows95-text flex min-w-0 flex-1 flex-col text-xs">
        <span className="truncate" title={activity.media_title ?? ""}>
          {Icon && <Icon className="mr-0.5 inline size-2.5 align-[-1px]" />}
          {statusKey ? t(statusKey) : (activity.status ?? "")} - {activity.media_title}
          {activity.progress ? ` (${activity.progress})` : ""}
        </span>
        <span className="text-hint windows95-font text-xs">{time}</span>
      </div>
      <ActivityLikeButton activity={activity} />
    </div>
  );
}
