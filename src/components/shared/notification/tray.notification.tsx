import { cn } from "cn";
import { Bell, BellDot, CheckCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTorrents } from "@/hooks/torrent/queries.hook";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { isCurrentDownload } from "@/lib/torrent/common.utils";
import { getVisibleNotifications } from "@/lib/utils/notification.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { NotificationFilter } from "@/types/notification";
import type { TorrentInfo } from "@/types/torrent";

import NotificationRow from "./row.notification";
import ActiveTorrentItem from "./torrentItem.notification";

const FILTERS: readonly NotificationFilter[] = [
  "all",
  "info",
  "success",
  "warning",
  "error",
  "downloads",
];

const filterKeys: Record<NotificationFilter, TranslationKey> = {
  all: "notification.filter.all",
  downloads: "notification.filter.downloads",
  error: "notification.filter.error",
  info: "notification.filter.info",
  success: "notification.filter.success",
  warning: "notification.filter.warning",
};

const EMPTY_TORRENTS: TorrentInfo[] = [];

export default function NotificationTray() {
  const { items, unreadCount, markRead, markAllRead, clear, clearAll } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const ref = useRef<HTMLDivElement>(null);

  const { data: torrents = EMPTY_TORRENTS } = useTorrents(open);
  const activeDownloads = useMemo(() => torrents.filter(isCurrentDownload), [torrents]);
  const { t } = useI18n();
  const latest = items[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const visible = useMemo(() => getVisibleNotifications(items, filter), [items, filter]);

  return (
    <div ref={ref} className="relative">
      <div
        className="sr-only"
        role={latest?.type === "error" ? "alert" : "status"}
        aria-live={latest?.type === "error" ? "assertive" : "polite"}
      >
        {latest ? `${latest.title}${latest.message ? `. ${latest.message}` : ""}` : ""}
      </div>
      <Button
        size="icon"
        className="relative h-5 w-5"
        onClick={() => setOpen((v) => !v)}
        title={t("notification.title")}
        aria-label={t("notification.title")}
        aria-expanded={open}
      >
        {unreadCount > 0 ? (
          <>
            <BellDot className="size-3" />
            <span className="bg-destructive absolute -top-1 -right-1 flex size-3.5 items-center justify-center text-xs text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        ) : (
          <Bell className="size-3" />
        )}
      </Button>

      {open && (
        <div
          className="windows95-border absolute top-full right-0 z-50 mt-1 w-100 max-w-[90vw] bg-white"
          role="region"
          aria-label={t("notification.title")}
        >
          <div className="bg-secondary border-muted flex items-center justify-between border-b px-1 py-0.5 text-white">
            <span className="windows95-text text-xs font-bold">
              {t("notification.count", { count: items.length })}
            </span>
            <div className="flex gap-0.5">
              <Button
                size="icon"
                className="h-4 w-4"
                onClick={markAllRead}
                title={t("notification.mark.all.read")}
                aria-label={t("notification.mark.all.read")}
                disabled={unreadCount === 0 || filter === "downloads"}
              >
                <CheckCheck className="size-2.5" />
              </Button>
              <Button
                size="icon"
                className="h-4 w-4"
                onClick={clearAll}
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
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  title={t(filterKeys[f])}
                  aria-pressed={filter === f}
                  className={cn(
                    "windows95-text windows95-active-border px-1 py-px text-xs select-none hover:cursor-pointer",
                    filter === f
                      ? "bg-secondary text-white"
                      : "bg-primary text-text hover:bg-surface"
                  )}
                >
                  {t(filterKeys[f])}
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
                activeDownloads.map((torrent) => (
                  <ActiveTorrentItem key={torrent.id} item={torrent} />
                ))
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
                    markRead={markRead}
                    clear={clear}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
