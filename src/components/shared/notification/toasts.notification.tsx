import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import {
  NOTIFICATION_TOAST_STRIP,
  TOAST_DEFAULTS,
  TOAST_DURATION_MS,
} from "@/config/settings/notifications.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/state/signal.hook";
import { createInterval } from "@/lib/pacer/interval.utils";
import { scheduleTask } from "@/lib/pacer/shared.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import {
  openNotificationTarget,
  showError,
} from "@/lib/utils/notification.utils";
import {
  markNotificationRead,
  notificationAtoms,
} from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type { NotificationItem } from "@/types/notification";

const COUNTDOWN_TICK_MS = 100;

const FOCUS_RING =
  "outline-none focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-offset-[-2px] focus-visible:outline-text";

function ToastItem({
  item,
  onHide,
  onBodyClick,
  isClosing,
  onHidden,
}: {
  item: NotificationItem;
  onHide: (id: number) => void;
  onBodyClick: (item: NotificationItem) => void;
  isClosing: boolean;
  onHidden: (id: number) => void;
}) {
  const { t } = useI18n();
  const animateToasts = useCell(settingsAtoms.animateToasts);
  const toastRef = useRef<HTMLDivElement>(null);
  const remainingRef = useRef<number>(TOAST_DURATION_MS[item.type]);
  const deadlineRef = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);
  const [remainingMs, setRemainingMs] = useState<number>(TOAST_DURATION_MS[item.type]);
  const openable = Boolean(item.target);

  useEffect(() => {
    if (!animateToasts || toastRef.current === null) return;
    toastRef.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 150, easing: "ease-out" }
    );
  }, [animateToasts]);

  const startExit = useCallback((): void => {
    if (!animateToasts || toastRef.current === null) {
      onHide(item.id);
      return;
    }
    const animation = toastRef.current.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 150, easing: "ease-out" }
    );
    animation.finished.then(() => onHidden(item.id)).catch(() => undefined);
  }, [animateToasts, item.id, onHide, onHidden]);

  useEffect(() => {
    deadlineRef.current = Date.now() + remainingRef.current;
    const ticker = createInterval(() => {
      if (pausedRef.current) {
        setRemainingMs(remainingRef.current);
        return;
      }
      const left = Math.max(0, deadlineRef.current - Date.now());
      if (left <= 0) {
        startExit();
        return;
      }
      setRemainingMs(left);
    }, COUNTDOWN_TICK_MS);
    return () => ticker.cancel();
  }, [item.id, startExit]);

  const pause = () => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
    setRemainingMs(remainingRef.current);
  };

  const resume = () => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    if (remainingRef.current <= 0) {
      startExit();
      return;
    }
    deadlineRef.current = Date.now() + remainingRef.current;
  };

  const handleActivate = () => onBodyClick(item);
  const openLabel = openable ? t("notification.open") : undefined;
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));

  const handleManualClose = () => {
    markNotificationRead(item.id);
    startExit();
  };

  return (
    <div
      ref={toastRef}
      role={item.type === "error" ? "alert" : "status"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      onClick={openable ? handleActivate : undefined}
      className={`windows95-border bg-primary pointer-events-auto w-[340px] max-w-[92vw] select-none ${
        openable ? "cursor-pointer" : ""
      } ${isClosing ? "opacity-0" : ""}`}
    >
      <div className="bg-secondary text-title-text flex items-center gap-1.5 px-1.5 py-1">
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-none">
          iluhaAnime
        </span>
        <Button
          size="icon"
          className="h-5 w-5 shrink-0"
          aria-label={t("notification.dismiss")}
          title={t("notification.dismiss")}
          onClick={(e) => {
            e.stopPropagation();
            handleManualClose();
          }}
        >
          <X className="size-3" />
        </Button>
      </div>
      <div className="px-2.5 pt-2">
        <div className="min-w-0 flex-1 pb-1">
          {item.message ? (
            <div className="text-text truncate text-sm font-bold leading-tight">
              {item.title}
            </div>
          ) : (
            <span
              className={`text-text block truncate text-sm font-bold leading-tight ${FOCUS_RING} ${
                openable ? "hover:underline" : ""
              }`}
              role={openable ? "button" : undefined}
              tabIndex={openable ? 0 : undefined}
              title={openLabel}
              aria-label={openLabel}
              onKeyDown={openable ? enterOrSpace(handleActivate) : undefined}
            >
              {item.title}
            </span>
          )}
          {item.message && (
            <div
              className={`text-text mt-0.5 line-clamp-2 text-[13px] leading-snug break-words ${FOCUS_RING} ${
                openable ? "hover:bg-surface/50" : ""
              }`}
              role={openable ? "button" : undefined}
              tabIndex={openable ? 0 : undefined}
              title={openLabel}
              aria-label={openLabel}
              onKeyDown={openable ? enterOrSpace(handleActivate) : undefined}
            >
              {item.message}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 px-2.5 pt-1 pb-1">
        <ProgressBar
          value={remainingMs}
          max={TOAST_DURATION_MS[item.type]}
          className="h-3 min-w-0 flex-1"
          barClassName={NOTIFICATION_TOAST_STRIP[item.type]}
          ariaLabel={item.title}
        />
        <span className="text-text w-12 shrink-0 text-right text-xs tabular-nums">
          {t("notification.countdown.seconds", { s: secondsLeft })}
        </span>
      </div>
    </div>
  );
}

export default function NotificationToasts() {
  const { t } = useI18n();
  const items = useCell(notificationAtoms.items);
  const popupMode = useCell(settingsAtoms.notificationPopups);
  const animateToasts = useCell(settingsAtoms.animateToasts);
  const inApp = popupMode === "inapp" || popupMode === "both";
  const [queue, setQueue] = useState<number[]>([]);
  const [closing, setClosing] = useState<Set<number>>(new Set());
  const seenRef = useRef<Set<number> | null>(null);
  if (seenRef.current === null) {
    seenRef.current = new Set(items.map((item) => item.id));
  }

  useEffect(() => {
    const seen = seenRef.current ?? new Set<number>();
    if (!inApp) {
      for (const item of items) seen.add(item.id);
      setQueue([]);
      setClosing(new Set());
      return;
    }
    const fresh = items.filter((item) => !item.progress && !seen.has(item.id));
    for (const item of fresh) seen.add(item.id);
    setQueue((prev) => {
      const visible = new Set(
        items.filter((item) => !item.progress).map((item) => item.id)
      );
      const kept = prev.filter((id) => visible.has(id));
      const freshIds = fresh.map((item) => item.id).filter((id) => !kept.includes(id));
      return [...freshIds, ...kept].slice(0, TOAST_DEFAULTS.maxVisible);
    });
  }, [items, inApp]);

  const handleToastHidden = useCallback(
    (id: number) => {
      setQueue((prev) => prev.filter((queued) => queued !== id));
      setClosing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    []
  );

  const handleBodyClick = useCallback(
    (item: NotificationItem) => {
      markNotificationRead(item.id);
      if (animateToasts) {
        setClosing((prev) => new Set(prev).add(item.id));
        scheduleTask("timeout", 150, () => {
          handleToastHidden(item.id);
        });
      } else {
        handleToastHidden(item.id);
      }
      const target = item.target;
      if (!target) return;
      (async () => {
        const result = await openNotificationTarget(target);
        if (result === "tab-disabled") {
          showError(t("common.error"), t("anilist.details.link.invalid"));
        }
      })();
    },
    [animateToasts, handleToastHidden, t]
  );
  if (!inApp || queue.length === 0) return null;
  const byId = new Map(items.map((item) => [item.id, item] as const));

  return (
    <div
      className="pointer-events-none fixed right-2 bottom-10 z-[60] flex w-[340px] max-w-[92vw] flex-col gap-1"
      role="region"
      aria-label={t("notification.title")}
    >
      {queue.map((id) => {
        const item = byId.get(id);
        if (!item) return null;
        return (
          <ToastItem
            key={id}
            item={item}
            isClosing={closing.has(id)}
            onHide={() => {
              setClosing((prev) => new Set(prev).add(id));
              if (!animateToasts) {
                handleToastHidden(id);
              }
            }}
            onBodyClick={handleBodyClick}
            onHidden={handleToastHidden}
          />
        );
      })}
    </div>
  );
}
