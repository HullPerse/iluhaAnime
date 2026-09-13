import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { STATUS_SHRINK_CLASS } from "@/config/collection/statuses.config";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { shrinkLevelFor, sortStatuses, statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionStatus, CollectionStatusDef } from "@/types/collection";

export function StatusCollection({
  statuses,
  selectedStatus,
  onSelect,
  counts,
}: {
  statuses: CollectionStatusDef[];
  selectedStatus: CollectionStatus | "all";
  onSelect: (status: CollectionStatus | "all") => void;
  counts?: Record<string, number>;
}) {
  const { t, locale } = useI18n();

  const tabs = [
    { id: "all" as CollectionStatus | "all", label: t("collection.library.all"), color: null },
    ...sortStatuses(statuses).map((s) => ({
      id: s.id,
      label: statusLabel(statuses, s.id, t, locale),
      color: s.color,
    })),
  ];
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selectedStatus)
  );
  const { rowRef, start, end, stepPage } = usePagedRow(tabs.length, selectedIndex);
  const visible = tabs.slice(start, end);

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
          const text =
            counts && counts[tab.id] != null ? `${tab.label} (${counts[tab.id]})` : tab.label;
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
    </div>
  );
}
