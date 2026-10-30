import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatAiringTime } from "@/lib/core/airing.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { AiringEntry } from "@/types/anilist/stats.anilist";

export function DayEntriesList({
  dayEntries,
  onEntryClick,
}: {
  dayEntries: AiringEntry[];
  onEntryClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <section className="windows95-border bg-field min-h-80 overflow-y-auto">
      {dayEntries.map((entry) => (
        <div
          key={entry.id}
          role="button"
          tabIndex={0}
          aria-label={entry.title}
          data-vim-target="stats-entry"
          className="hover:bg-surface border-t-muted border-l-muted border-r-win-highlight border-b-win-highlight flex cursor-pointer items-center gap-2 border-b px-2 py-1"
          onClick={() => onEntryClick(entry.id)}
          onKeyDown={enterOrSpace(() => onEntryClick(entry.id))}
        >
          {entry.coverUrl && (
            <ImageComponent
              src={entry.coverUrl}
              alt="coverUrl"
              className="windows95-border h-11 w-8 shrink-0"
            />
          )}
          <span className="windows95-font flex-1 truncate text-xs">{entry.title}</span>
          <span className="text-hint windows95-font shrink-0 text-xs">
            {formatAiringTime(entry.airingAt, locale)}
          </span>
          {entry.episode != null && (
            <span className="text-hint windows95-font shrink-0 text-xs">
              {t("anilist.activity.episode", { n: entry.episode })}
            </span>
          )}
        </div>
      ))}
      {dayEntries.length === 0 && (
        <div className="text-hint windows95-font flex h-80 items-center justify-center text-xs">
          {t("anilist.stats.no.releases")}
        </div>
      )}
    </section>
  );
}
