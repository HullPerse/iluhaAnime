import { X } from "lucide-react";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { useCallback, useEffect, useRef, useState } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { NOTIFICATION_TOAST_STRIP, TOAST_DURATION_MS } from "@/config/system/notifications.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { createInterval } from "@/lib/core/interval.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import { markNotificationRead } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type { NotificationItem } from "@/types/core/notification";

const COUNTDOWN_TICK_MS = 100;

const FOCUS_RING =
  "outline-none focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-offset-[-2px] focus-visible:outline-text";

export function ToastItem({
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
    toastRef.current.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 150,
      easing: "ease-out",
    });
  }, [animateToasts]);

  const startExit = useCallback((): void => {
    if (!animateToasts || toastRef.current === null) {
      onHide(item.id);
      return;
    }
    const animation = toastRef.current.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 150,
      easing: "ease-out",
    });
    animation.finished
      .then(() => onHidden(item.id))
      .catch((error: unknown) =>
        reportBackgroundError("srccomponentssharednotificationtoaststoastItem.toasts", error)
      );
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
        <span className="min-w-0 flex-1 truncate text-[13px] leading-none font-bold">
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
            <div className="text-text truncate text-sm leading-tight font-bold">{item.title}</div>
          ) : (
            <span
              className={`text-text block truncate text-sm leading-tight font-bold ${FOCUS_RING} ${
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
