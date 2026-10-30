import { useCallback, useEffect, useRef, useState } from "react";

import { TOAST_DEFAULTS } from "@/config/system/notifications.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { scheduleTask } from "@/lib/core/shared.utils";
import { openNotificationTarget, showError } from "@/lib/core/notification.utils";
import { markNotificationRead, notificationAtoms } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type { NotificationItem } from "@/types/core/notification";

import { ToastItem } from "@/components/shared/notification/toasts/toastItem.toasts";

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
      const visible = new Set(items.filter((item) => !item.progress).map((item) => item.id));
      const kept = prev.filter((id) => visible.has(id));
      const freshIds = fresh.map((item) => item.id).filter((id) => !kept.includes(id));
      return [...freshIds, ...kept].slice(0, TOAST_DEFAULTS.maxVisible);
    });
  }, [items, inApp]);

  const handleToastHidden = useCallback((id: number) => {
    setQueue((prev) => prev.filter((queued) => queued !== id));
    setClosing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

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
