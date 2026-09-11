import { cn } from "cn";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import {
  COPIED_FEEDBACK_MS,
  copyNotification,
  formatRelativeTime,
} from "@/lib/utils/notification.utils";
import type { NotificationItem } from "@/types/notification";

import { typeColors, typeIcons } from "./look.notification";

interface NotificationRowProps {
  item: NotificationItem;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
  markRead: (id: number) => void;
  clear: (id: number) => void;
}

export default function NotificationRow({ item, t, markRead, clear }: NotificationRowProps) {
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
      timer.current = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
    }
  };

  return (
    <div
      className={cn(
        "border-muted/30 hover:bg-surface/50 flex cursor-pointer items-start gap-1 border-b px-1 py-0.5",
        item.read && "opacity-60"
      )}
      onClick={() => {
        markRead(item.id);
      }}
    >
      <span className={cn("mt-0.5 shrink-0", typeColors[item.type])}>{typeIcons[item.type]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="windows95-text min-w-0 flex-1 truncate text-xs font-bold">
            {item.title}
          </span>
          <span className="text-hint shrink-0 text-xs">
            {formatRelativeTime(item.timestamp, t)}
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
