import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { SCROLL_STEP } from "@/config/collection/statuses.config";
import { statusLabel } from "@/lib/collection/status.utils";
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
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const tabs = [
    { id: "all" as CollectionStatus | "all", label: t("collection.library.all"), color: null },
    ...statuses.map((s) => ({
      id: s.id,
      label: statusLabel(statuses, s.id, t),
      color: s.color,
    })),
  ];

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const update = () => {
      setCanScrollLeft(scroller.scrollLeft > 1);
      setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver === "undefined")
      return () => scroller.removeEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(content);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const selected = scrollRef.current?.querySelector(`[data-status-tab="${selectedStatus}"]`);
    if (selected && typeof selected.scrollIntoView === "function") {
      selected.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selectedStatus]);

  const scrollByStep = (direction: 1 | -1) => {
    if (typeof scrollRef.current?.scrollBy === "function") {
      scrollRef.current.scrollBy({ left: direction * SCROLL_STEP, behavior: "smooth" });
    }
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="windows95-active-border bg-primary scroll-px-8 overflow-x-auto p-1"
        aria-label={t("collection.section.library")}
      >
        <div ref={contentRef} className="flex w-max gap-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              data-status-tab={tab.id}
              variant={selectedStatus === tab.id ? "outline" : "default"}
              className="h-6 px-2 text-xs"
              aria-current={selectedStatus === tab.id ? true : undefined}
              onClick={() => onSelect(tab.id)}
            >
              {tab.color && (
                <span
                  className="windows95-border inline-block size-2.5"
                  style={{ backgroundColor: tab.color }}
                  aria-hidden
                />
              )}
              {tab.label}
              {counts && counts[tab.id] != null && ` (${counts[tab.id]})`}
            </Button>
          ))}
        </div>
      </div>
      {canScrollLeft && (
        <Button
          size="icon"
          className="absolute top-1/2 left-1 z-10 -translate-y-1/2"
          title={t("common.previous")}
          aria-label={t("common.previous")}
          onClick={() => scrollByStep(-1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
      )}
      {canScrollRight && (
        <Button
          size="icon"
          className="absolute top-1/2 right-1 z-10 -translate-y-1/2"
          title={t("common.next")}
          aria-label={t("common.next")}
          onClick={() => scrollByStep(1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      )}
    </div>
  );
}
