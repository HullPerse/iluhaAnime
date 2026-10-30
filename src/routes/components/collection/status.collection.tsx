import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { PUBLIC_STATUS_MAX_ITEMS, STATUS_SHRINK_CLASS } from "@/config/anilist/statuses.config";
import { useI18n } from "@/hooks/i18n.hook";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { shrinkLevelFor, sortStatuses, statusLabel } from "@/lib/core/status.utils";
import type { CollectionStatus, CollectionStatusDef } from "@/types/anilist/collection";

import { ShareStatusButton } from "./status/shareButton.status";

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
