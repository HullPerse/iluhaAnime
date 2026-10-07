import { useEffect, useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { formatActivityTime } from "@/lib/anilist/activity.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { useAniListNotificationsStore } from "@/store/anilist.store";
import type { AniSiteNotification } from "@/types/anilist";

function notificationText(item: AniSiteNotification): string {
  if (item.context) return item.context;
  if (item.contexts.length > 0) return item.contexts.join(" ");
  if (item.text) return item.text;
  return "";
}

function NotificationRow({
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
  const body =
    item.kind === "airing" && item.anime_title
      ? `${item.anime_title} - Ep. ${item.episode ?? "?"}`
      : notificationText(item);
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
          {unread && <span className="text-highlight font-bold">{"• "}</span>}
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

export function NotificationsTab({ onAnimeClick }: { onAnimeClick: (id: number) => void }) {
  const { t } = useI18n();
  const readIds = useAniListNotificationsStore((s) => s.readNotificationIds);
  const markSiteNotificationsRead = useAniListNotificationsStore(
    (s) => s.markSiteNotificationsRead
  );
  const { data, isLoading, isError, refetch } = useAppQuery("slow", {
    queryKey: queryKeys.siteNotifications(),
    queryFn: () => anilistApi.getSiteNotifications(),
    retry: false,
    placeholderData: (previous) => previous,
  });
  const items = useMemo(() => data ?? [], [data]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  useEffect(() => {
    if (itemIds.length > 0) markSiteNotificationsRead(itemIds);
  }, [itemIds, markSiteNotificationsRead]);
  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <SmallLoader size={5} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center text-xs">
          {t("anilist.notifications.load.error")}
        </span>
        <Button onClick={() => refetch()} className="text-xs">
          {t("anilist.activity.retry")}
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <span className="windows95-text text-hint block p-3 text-center text-xs">
        {t("anilist.notifications.empty")}
      </span>
    );
  }
  const read = new Set(readIds);
  return (
    <div className="flex flex-col gap-1 p-1">
      {items.map((item) => (
        <NotificationRow
          key={item.id}
          item={item}
          unread={!read.has(item.id)}
          onAnimeClick={onAnimeClick}
        />
      ))}
    </div>
  );
}
