import { cn } from "cn";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import {
  NOTIFICATION_TYPE_COLORS,
  NOTIFICATION_TYPE_ICONS,
} from "@/config/system/notifications.config";
import { Debouncer } from "@/lib/core/debounce.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import {
  COPIED_FEEDBACK_MS,
  copyNotification,
  formatRelativeTime,
} from "@/lib/core/notification.utils";
import type { NotificationRowProps } from "@/types/core/notification";

export default function NotificationRow({
  item,
  t,
  locale,
  markRead,
  clear,
  onOpen,
}: NotificationRowProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const copyHideRef = useRef<Debouncer<[]> | null>(null);
  const TypeIcon = NOTIFICATION_TYPE_ICONS[item.type];
  const openable = Boolean(item.target);

  useEffect(() => () => copyHideRef.current?.cancel(), []);

  const handleOpen = () => {
    markRead(item.id);
    if (item.target) onOpen(item);
  };

  const handleCopy = async () => {
    const [, error] = await attempt(copyNotification(item));
    if (error) return;
    setCopied(true);
    if (copyHideRef.current === null) {
      copyHideRef.current = new Debouncer(() => setCopied(false), {
        wait: COPIED_FEEDBACK_MS,
      });
    }
    copyHideRef.current.maybeExecute();
  };

  return (
    <div
      className={cn(
        "border-muted/30 hover:bg-surface/50 flex cursor-pointer items-start gap-1 border-b px-1 py-0.5",
        item.read && "opacity-60"
      )}
      onClick={handleOpen}
      role={openable ? "button" : undefined}
      tabIndex={openable ? 0 : undefined}
      title={openable ? t("notification.open") : undefined}
      onKeyDown={openable ? enterOrSpace(handleOpen) : undefined}
    >
      <span className={cn("mt-0.5 shrink-0", NOTIFICATION_TYPE_COLORS[item.type])}>
        {item.progress ? <SmallLoader size={2.5} /> : <TypeIcon className="size-2.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="windows95-text min-w-0 flex-1 truncate text-xs font-bold">
            {item.title}
          </span>
          <span className="text-hint shrink-0 text-xs">
            {formatRelativeTime(item.timestamp, locale)}
          </span>
        </div>
        {item.message && <div className="text-hint truncate text-xs">{item.message}</div>}
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
        rendered={!item.progress}
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
