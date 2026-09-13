import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { STATUS_SHRINK_CLASS } from "@/config/collection/statuses.config";
import { usePagedRow } from "@/hooks/pagedRow.hook";
import { shrinkLevelFor } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";

export default function AniListListsRow({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: readonly { id: string; label: string; color?: string | null }[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTab)
  );
  const { rowRef, start, end, stepPage } = usePagedRow(tabs.length, activeIndex);
  const visible = tabs.slice(start, end);

  return (
    <div
      className="windows95-active-border bg-primary flex items-center gap-1 p-1"
      aria-label={t("anilist.lists.title")}
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
        {visible.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? "outline" : "default"}
            className="h-6 w-33 shrink-0 px-1"
            aria-current={activeTab === tab.id ? true : undefined}
            onClick={() => onChange(tab.id)}
          >
            {tab.color && (
              <span
                className="windows95-border inline-block size-2.5 shrink-0"
                style={{ backgroundColor: tab.color }}
                aria-hidden
              />
            )}
            <span
              className={`min-w-0 flex-1 truncate ${STATUS_SHRINK_CLASS[shrinkLevelFor(tab.label)]}`}
            >
              {tab.label}
            </span>
          </Button>
        ))}
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
