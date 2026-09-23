import { Bell, BellDot } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { NO_TORRENTS } from "@/config/torrent/common.config";
import { useTorrents } from "@/hooks/torrent/queries.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { isCurrentDownload } from "@/lib/torrent/common.utils";
import { openNotificationTarget, showError } from "@/lib/utils/notification.utils";
import { useNotificationStore } from "@/store/notification.store";
import type { NotificationFilter, NotificationItem } from "@/types/notification";

import NotificationPanel from "./panel.notification";

export default function NotificationTray() {
  const { items, unreadCount, markRead, markAllRead, clear, clearAll } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const ref = useRef<HTMLDivElement>(null);

  const { data: torrents = NO_TORRENTS } = useTorrents(open);
  const activeDownloads = useMemo(() => torrents.filter(isCurrentDownload), [torrents]);
  const { t } = useI18n();
  const latest = items[0];

  const handleOpen = useCallback(
    async (item: NotificationItem) => {
      if (!item.target) return;
      const result = await openNotificationTarget(item.target);
      if (result === "tab-disabled") {
        showError(t("common.error"), t("anilist.details.link.invalid"));
        return;
      }
      if (result === "opened") setOpen(false);
    },
    [t]
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

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
        <NotificationPanel
          items={items}
          activeDownloads={activeDownloads}
          filter={filter}
          onFilterChange={setFilter}
          unreadCount={unreadCount}
          onMarkAllRead={markAllRead}
          onClearAll={clearAll}
          onMarkRead={markRead}
          onClear={clear}
          onOpen={handleOpen}
        />
      )}
    </div>
  );
}
