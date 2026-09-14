import { Check, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { PUBLIC_STATUS_MAX_ITEMS, STATUS_SHRINK_CLASS } from "@/config/collection/statuses.config";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { shrinkLevelFor, sortStatuses, statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionStatus, CollectionStatusDef } from "@/types/collection";

/**
 * Mirrors the AniList copy-link button: the tick is the whole confirmation, with no
 * notification to dismiss.
 */
function ShareStatusButton({ onShare }: { onShare: () => Promise<void> | void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  return (
    <Button
      size="icon"
      className="size-6 shrink-0"
      title={t("collection.share.copy")}
      aria-label={t("collection.share.copy")}
      onClick={() => {
        const result = onShare();
        if (result === undefined) return;
        result
          .then(() => {
            setCopied(true);
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => undefined);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
    </Button>
  );
}

export function StatusCollection({
  statuses,
  selectedStatus,
  onSelect,
  counts,
  onShare,
}: {
  statuses: CollectionStatusDef[];
  selectedStatus: CollectionStatus | "all";
  onSelect: (status: CollectionStatus | "all") => void;
  counts?: Record<string, number>;
  onShare?: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();

  const tabs = [
    {
      id: "all" as CollectionStatus | "all",
      label: t("collection.library.all"),
      color: null,
      isPublic: false,
    },
    ...sortStatuses(statuses).map((s) => ({
      id: s.id,
      label: statusLabel(statuses, s.id, t, locale),
      color: s.color,
      isPublic: s.kind === "public",
    })),
  ];
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selectedStatus)
  );
  const { rowRef, start, end, stepPage } = usePagedRow(tabs.length, selectedIndex);
  const visible = tabs.slice(start, end);
  const selectedIsPublic = tabs.some((tab) => tab.id === selectedStatus && tab.isPublic);

  return (
    <div
      className="windows95-active-border bg-primary flex items-center gap-1 p-1"
      aria-label={t("collection.section.library")}
    >
      <Button
        size="icon"
        className="size-6 shrink-0"
        title={t("common.previous")}
        aria-label={t("common.previous")}
        onClick={() => stepPage(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <div ref={rowRef} className="flex min-w-0 flex-1 gap-1 overflow-hidden">
        {visible.map((tab) => {
          const count = counts?.[tab.id];
          const shown = tab.isPublic ? `${count ?? 0}/${PUBLIC_STATUS_MAX_ITEMS}` : count;
          const text = count == null ? tab.label : `${tab.label} (${shown})`;
          return (
            <Button
              key={tab.id}
              variant={selectedStatus === tab.id ? "outline" : "default"}
              className="h-6 w-33 shrink-0 px-1"
              aria-current={selectedStatus === tab.id ? true : undefined}
              onClick={() => onSelect(tab.id)}
            >
              {tab.color && (
                <span
                  className="windows95-border inline-block size-2.5 shrink-0"
                  style={{ backgroundColor: tab.color }}
                  aria-hidden
                />
              )}
              <span
                className={`min-w-0 flex-1 truncate ${STATUS_SHRINK_CLASS[shrinkLevelFor(text)]}`}
              >
                {text}
              </span>
            </Button>
          );
        })}
      </div>
      <Button
        size="icon"
        className="size-6 shrink-0"
        title={t("common.next")}
        aria-label={t("common.next")}
        onClick={() => stepPage(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
      {onShare && selectedIsPublic && <ShareStatusButton onShare={onShare} />}
    </div>
  );
}
