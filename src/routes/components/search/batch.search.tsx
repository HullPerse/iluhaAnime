import { Download } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { groupBatchResults } from "@/lib/torrent/batch.utils";
import type { Anime } from "@/types/torrent/torrent";

export default function BatchDownloadBar({
  items,
  busy,
  progress,
  onDownload,
}: {
  items: Anime[];
  busy: boolean;
  progress: { done: number; total: number } | null;
  onDownload: (items: Anime[]) => void;
}) {
  const { t } = useI18n();
  const groups = useMemo(() => groupBatchResults(items), [items]);
  if (groups.length === 0) return null;

  return (
    <section className="windows95-border bg-field flex flex-col gap-1 p-1">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="windows95-text font-bold">{t("search.batch.title")}</span>
        <span className="text-hint">
          {t("search.batch.hint", { groups: groups.length, count: items.length })}
        </span>
        {progress && (
          <span className="text-hint ml-auto tabular-nums">
            {t("search.batch.progress", { done: progress.done, total: progress.total })}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {groups.map((group) => (
          <Button
            key={group.key}
            className="h-6 max-w-full gap-1 px-1 text-xs"
            disabled={busy}
            title={`${group.title}${group.group ? ` [${group.group}]` : ""}`}
            onClick={() => onDownload(group.items)}
          >
            <Download className="size-3 shrink-0" />
            <span className="truncate">
              {group.title}
              {group.items.length > 1 ? ` ×${group.items.length}` : ""}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}
