import { cn } from "cn";
import { CheckCheck, Trash2 } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button.component";
import {
  NOTIFICATION_FILTERS,
  NOTIFICATION_FILTER_KEYS,
} from "@/config/settings/notifications.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { getVisibleNotifications } from "@/lib/utils/notification.utils";
import type { NotificationFilter, NotificationItem } from "@/types/notification";
import type { TorrentInfo } from "@/types/torrent";

import NotificationRow from "./row.notification";
import ActiveTorrentItem from "./torrentItem.notification";

export default function NotificationPanel({
  items,
  activeDownloads,
  filter,
  onFilterChange,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  onMarkRead,
  onClear,
  onOpen,
}: {
  items: NotificationItem[];
  activeDownloads: TorrentInfo[];
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  unreadCount: number;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onMarkRead: (id: number) => void;
  onClear: (id: number) => void;
  onOpen: (item: NotificationItem) => void;
}) {
  const { t, locale } = useI18n();
  const visible = useMemo(() => getVisibleNotifications(items, filter), [items, filter]);

  return (
    <div
      className="windows95-border bg-field absolute top-full right-0 z-50 mt-1 w-100 max-w-[90vw]"
      role="region"
      aria-label={t("notification.title")}
    >
      <div className="bg-secondary border-muted text-title-text flex items-center justify-between border-b px-1 py-0.5">
        <span className="windows95-text text-xs font-bold">
          {t("notification.count", { count: items.length })}
        </span>
        <div className="flex gap-0.5">
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={onMarkAllRead}
            title={t("notification.mark.all.read")}
            aria-label={t("notification.mark.all.read")}
            disabled={unreadCount === 0 || filter === "downloads"}
          >
            <CheckCheck className="size-2.5" />
          </Button>
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={onClearAll}
            title={t("notification.clear.all")}
            aria-label={t("notification.clear.all")}
            disabled={items.length === 0 || filter === "downloads"}
          >
            <Trash2 className="size-2.5" />
          </Button>
        </div>
      </div>

      {(items.length > 0 || activeDownloads.length > 0 || filter === "downloads") && (
        <div className="border-muted/30 bg-primary/60 flex flex-wrap gap-0.5 border-b px-1 py-0.5">
          {NOTIFICATION_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilterChange(f)}
              title={t(NOTIFICATION_FILTER_KEYS[f])}
              aria-pressed={filter === f}
              className={cn(
                "windows95-text windows95-active-border px-1 py-px text-xs select-none hover:cursor-pointer",
                filter === f
                  ? "bg-secondary text-title-text"
                  : "bg-primary text-text hover:bg-surface"
              )}
            >
              {t(NOTIFICATION_FILTER_KEYS[f])}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-60 overflow-y-auto">
        {filter === "downloads" ? (
          activeDownloads.length === 0 ? (
            <div className="text-hint flex items-center justify-center py-4 text-xs">
              {t("notification.downloads.empty")}
            </div>
          ) : (
            activeDownloads.map((torrent) => <ActiveTorrentItem key={torrent.id} item={torrent} />)
          )
        ) : (
          <>
            {visible.length === 0 && (
              <div className="text-hint flex items-center justify-center py-4 text-xs">
                {items.length === 0 ? t("notification.empty") : t("notification.filter.empty")}
              </div>
            )}
            {visible.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                t={t}
                locale={locale}
                markRead={onMarkRead}
                clear={onClear}
                onOpen={onOpen}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
