import {
  Bell,
  BellDot,
  X,
  Check,
  CheckCheck,
  Copy,
  Trash2,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/index.utils";
import { copyNotification, formatRelativeTime } from "@/lib/notification.utils";
import { fmtETA, fmtSize, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import type { NotificationItem, NotificationType } from "@/types/notification";
import type { TorrentInfo } from "@/types/torrent";

const typeColors: Record<NotificationType, string> = {
  error: "text-red-600",
  info: "text-blue-600",
  success: "text-green-600",
  warning: "text-orange-500",
};

const typeIcons: Record<NotificationType, ReactNode> = {
  error: <XCircle className="size-2.5" />,
  info: <Info className="size-2.5" />,
  success: <CheckCircle2 className="size-2.5" />,
  warning: <AlertTriangle className="size-2.5" />,
};

type Filter = NotificationType | "all" | "downloads";

const FILTERS: readonly Filter[] = [
  "all",
  "info",
  "success",
  "warning",
  "error",
  "downloads",
];

const filterKeys: Record<Filter, TranslationKey> = {
  all: "notification.filterAll",
  downloads: "notification.filterDownloads",
  error: "notification.filterError",
  info: "notification.filterInfo",
  success: "notification.filterSuccess",
  warning: "notification.filterWarning",
};

function isCurrentDownload(torrent: TorrentInfo): boolean {
  return (
    !torrent.finished && torrent.state !== "paused" && torrent.state !== "error"
  );
}

const EMPTY_TORRENTS: TorrentInfo[] = [];

function ActiveTorrentItem({ item }: { item: TorrentInfo }) {
  const { t } = useI18n();
  const progress = Math.max(0, Math.min(1, item.progress));
  const percentage = Math.round(progress * 100);
  const eta = fmtETA(item.eta_secs, t);
  const speed = fmtSpeed(item.download_speed);

  return (
    <div className="border-muted/30 border-b px-1 py-1">
      <div className="flex items-center gap-1">
        <Download className="text-secondary size-3 shrink-0" />
        <span
          className="windows95-text min-w-0 flex-1 truncate text-xs font-bold"
          title={item.name}
        >
          {item.name}
        </span>
        <span className="windows95-text shrink-0 text-xs">
          {percentage}%
        </span>
      </div>
      <div
        className="windows95-border mt-1 h-2 bg-white"
        role="progressbar"
        aria-label={`${item.name} ${percentage}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className="bg-secondary h-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-muted windows95-text mt-0.5 flex flex-wrap gap-x-2 text-xs">
        <span>
          {fmtSize(item.progress_bytes)} / {fmtSize(item.total_bytes)}
        </span>
        <span>{stateLabel(item.state, t)}</span>
        {speed && <span>{t("torrent.summary.download", { speed })}</span>}
        {eta && <span>ETA {eta}</span>}
      </div>
    </div>
  );
}

interface NotificationRowProps {
  item: NotificationItem;
  t: (
    key: TranslationKey,
    variables?: Record<string, string | number>
  ) => string;
  markRead: (id: number) => void;
  clear: (id: number) => void;
}

function NotificationRow({ item, t, markRead, clear }: NotificationRowProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  const handleCopy = async () => {
    try {
      await copyNotification(item);
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div
      className={`border-muted/30 hover:bg-surface/50 flex cursor-pointer items-start gap-1 border-b px-1 py-0.5 ${item.read ? "opacity-60" : ""}`}
      onClick={() => {
        markRead(item.id);
      }}
    >
      <span className={`mt-0.5 shrink-0 ${typeColors[item.type]}`}>
        {typeIcons[item.type]}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="windows95-text min-w-0 flex-1 truncate text-xs font-bold">
            {item.title}
          </span>
          <span className="text-muted shrink-0 text-xs">
            {formatRelativeTime(item.timestamp, t)}
          </span>
        </div>
        {item.message && (
          <div className="text-muted truncate text-xs">{item.message}</div>
        )}
      </div>
      <Button
        size="icon"
        className="h-4 w-4 shrink-0 opacity-60 hover:opacity-100"
        aria-label={t("notification.copy")}
        title={t("notification.copy")}
        onClick={(e) => {
          e.stopPropagation();
          handleCopy();
        }}
      >
        {copied ? <Check className="size-2" /> : <Copy className="size-2" />}
      </Button>
      <Button
        size="icon"
        className="h-4 w-4 shrink-0 opacity-60 hover:opacity-100"
        aria-label={t("notification.dismiss")}
        title={t("notification.dismiss")}
        onClick={(e) => {
          e.stopPropagation();
          clear(item.id);
        }}
      >
        <X className="size-2" />
      </Button>
    </div>
  );
}

export default function NotificationTray() {
  const { items, unreadCount, markRead, markAllRead, clear, clearAll } =
    useNotificationStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const ref = useRef<HTMLDivElement>(null);

  // Only track live torrent progress while the tray is open, so the per-second
  // torrent refresh does not re-render the tray (and its subtree) when closed.
  const torrents = useTorrentStore((state) =>
    open ? state.torrents : EMPTY_TORRENTS
  );
  const activeDownloads = useMemo(
    () => torrents.filter(isCurrentDownload),
    [torrents]
  );
  const { t } = useI18n();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const visible = useMemo(
    () =>
      filter === "all" || filter === "downloads"
        ? filter === "downloads"
          ? []
          : items
        : items.filter((i) => i.type === filter),
    [items, filter]
  );

  return (
    <div ref={ref} className="relative">
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
            <span className="bg-destructive absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full text-xs text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        ) : (
          <Bell className="size-3" />
        )}
      </Button>

      {open && (
        <div
          className="windows95-border absolute top-full right-0 z-50 mt-1 w-100 bg-white shadow-md"
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
                title={t("notification.markAllRead")}
                aria-label={t("notification.markAllRead")}
                disabled={unreadCount === 0 || filter === "downloads"}
              >
                <CheckCheck className="size-2.5" />
              </Button>
              <Button
                size="icon"
                className="h-4 w-4"
                onClick={clearAll}
                title={t("notification.clearAll")}
                aria-label={t("notification.clearAll")}
                disabled={items.length === 0 || filter === "downloads"}
              >
                <Trash2 className="size-2.5" />
              </Button>
            </div>
          </div>

          {(items.length > 0 ||
            activeDownloads.length > 0 ||
            filter === "downloads") && (
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
                <div className="text-muted flex items-center justify-center py-4 text-xs">
                  {t("notification.downloadsEmpty")}
                </div>
              ) : (
                activeDownloads.map((torrent) => (
                  <ActiveTorrentItem key={torrent.id} item={torrent} />
                ))
              )
            ) : (
              <>
                {visible.length === 0 && (
                  <div className="text-muted flex items-center justify-center py-4 text-xs">
                    {items.length === 0
                      ? t("notification.empty")
                      : t("notification.filterEmpty")}
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
