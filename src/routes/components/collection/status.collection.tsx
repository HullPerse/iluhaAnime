import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionStatus, CollectionStatusDef } from "@/types/collection";

const TAB_W = 132;
const SHRINK_AT = 16;
const SHRINK_MIN_AT = 24;

export function shrinkLevelFor(text: string): 0 | 1 | 2 {
  if (text.length > SHRINK_MIN_AT) return 2;
  if (text.length > SHRINK_AT) return 1;
  return 0;
}

const SHRINK_CLASS = ["text-xs", "text-[10px]", "text-[9px]"] as const;

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
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [perPage, setPerPage] = useState(4);
  const [page, setPage] = useState(0);

  const tabs = [
    { id: "all" as CollectionStatus | "all", label: t("collection.library.all"), color: null },
    ...statuses
      .map((s) => ({
        id: s.id,
        label: statusLabel(statuses, s.id, t, locale),
        color: s.color,
        isCore: s.isCore,
        rank: Number.isFinite(s.order) ? s.order : Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => Number(b.isCore) - Number(a.isCore) || a.rank - b.rank)
      .map(({ id, label, color }) => ({ id, label, color })),
  ];
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selectedStatus)
  );
  const pageCount = Math.max(1, Math.ceil(tabs.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const visible = tabs.slice(safePage * perPage, safePage * perPage + perPage);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const update = () => setPerPage(Math.max(1, Math.floor((el.clientWidth + 4) / (TAB_W + 4))));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPage(Math.floor(selectedIndex / perPage));
  }, [selectedIndex, perPage]);

  const stepPage = (direction: 1 | -1) => {
    setPage((safePage + direction + pageCount) % pageCount);
  };

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
              <span className={`min-w-0 flex-1 truncate ${SHRINK_CLASS[shrinkLevelFor(text)]}`}>
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
