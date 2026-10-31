import ImageComponent from "@/components/ui/image.component";
import { listStatusLabels } from "@/config/system/labels.config";
import { useI18n } from "@/hooks/i18n.hook";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { formatScore } from "@/lib/anilist/anilistScore.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { StatsMediaRow } from "@/types/anilist/anilistStats";
import type { AnilistScoreFormat } from "@/types/anilist/anilistScore";

/**
 * Drill-down row list used by the statistics Overview: one row per title,
 * opening the anime detail on click or Enter.
 */
export function MediaRows({
  rows,
  scoreFormat,
  onOpen,
}: {
  rows: StatsMediaRow[];
  scoreFormat: AnilistScoreFormat;
  onOpen: (id: number) => void;
}) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return (
      <div className="windows95-border bg-field text-hint windows95-font flex h-40 items-center justify-center text-xs">
        {t("anilist.stats.drill.empty")}
      </div>
    );
  }

  return (
    <div className="windows95-border bg-field max-h-96 min-h-40 overflow-y-auto">
      {rows.map((row) => (
        <div
          key={row.id}
          role="button"
          tabIndex={0}
          aria-label={row.title}
          data-vim-target="stats-entry"
          className="hover:bg-surface border-t-muted border-l-muted border-r-win-highlight border-b-win-highlight flex cursor-pointer items-center gap-2 border-b px-2 py-1"
          onClick={() => onOpen(row.id)}
          onKeyDown={enterOrSpace(() => onOpen(row.id))}
        >
          {row.coverUrl && (
            <ImageComponent
              src={row.coverUrl}
              alt=""
              className="windows95-border h-11 w-8 shrink-0"
            />
          )}
          <span className="windows95-font flex-1 truncate text-xs">{row.title}</span>
          <span
            className="inline-block size-3 shrink-0"
            style={{ background: getStatusColor(row.status) }}
            aria-hidden
          />
          <span className="text-hint windows95-font shrink-0 text-xs">
            {t(toLocaleKey(listStatusLabels[row.status] ?? row.status))}
          </span>
          <span className="windows95-font shrink-0 text-xs tabular-nums">
            {formatScore(row.score, scoreFormat)}
          </span>
        </div>
      ))}
    </div>
  );
}
