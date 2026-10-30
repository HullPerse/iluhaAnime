import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatActivityTime } from "@/lib/core/activity.utils";
import { notificationBody } from "@/lib/anilist/siteNotifications.utils";
import type { AniSiteNotification } from "@/types/anilist/anilist";

export function NotificationRow({
  item,
  unread,
  onAnimeClick,
}: {
  item: AniSiteNotification;
  unread: boolean;
  onAnimeClick: (id: number) => void;
}) {
  const { locale } = useI18n();
  const avatar = item.user_avatar ?? item.anime_cover;
  const title = item.user_name ?? item.anime_title ?? "";
  const body = notificationBody(item);
  const clickable = item.anime_id != null;
  const coverClass = clickable
    ? "windows95-active-border h-8 w-6 shrink-0 object-cover hover:cursor-pointer"
    : "windows95-active-border h-8 w-6 shrink-0 object-cover";
  const titleClass = clickable
    ? "truncate font-bold underline decoration-dotted hover:cursor-pointer"
    : "truncate";
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => {
        if (item.anime_id != null) onAnimeClick(item.anime_id);
      }}
      className="windows95-border bg-primary flex w-full items-start gap-1 px-1 py-0.5 text-left disabled:cursor-default"
    >
      {avatar ? (
        <ImageComponent src={avatar} alt="" className={coverClass} />
      ) : (
        <div className="windows95-active-border bg-field flex h-8 w-6 shrink-0 items-center justify-center text-xs font-bold">
          {title[0] ?? "?"}
        </div>
      )}
      <div className="windows95-text flex min-w-0 flex-1 flex-col text-xs">
        <span className={titleClass} title={title}>
          {unread && <span className="text-highlight font-bold">{"* "}</span>}
          {title}
        </span>
        <span className="line-clamp-2" title={body}>
          {body}
        </span>
        <span className="text-hint windows95-font text-xs">
          {formatActivityTime(item.created_at, locale)}
        </span>
      </div>
    </button>
  );
}
