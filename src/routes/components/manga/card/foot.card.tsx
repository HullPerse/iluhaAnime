import type { LibraryCopy } from "@/api/manga.api";
import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/hooks/i18n.hook";

export function MangaCardFoot({
  entry,
  completed,
  publication,
  chapters,
}: {
  entry?: LibraryCopy;
  completed: boolean;
  publication: string | null;
  chapters?: number | null;
}) {
  const { t } = useI18n();
  const total = entry ? entry.read + entry.unread : 0;
  const showProgress = entry != null && (completed || total > 0);
  const count = chapters != null && chapters > 0 ? chapters : null;
  const hasMeta = Boolean(publication) || count !== null;

  if (!hasMeta && !showProgress) return null;

  const max = Math.max(1, total);

  return (
    <div className="cards-shelf-foot">
      {hasMeta && (
        <span className="cards-shelf-meta">
          {publication && (
            <span className="windows95-text min-w-0 truncate" title={publication}>
              {publication}
            </span>
          )}
          {count !== null && (
            <span
              className="windows95-text shrink-0 font-bold tabular-nums"
              title={t("manga.search.chaptersTitle", { count })}
            >
              {t("manga.search.chapters", { count })}
            </span>
          )}
        </span>
      )}
      {hasMeta && !(showProgress && entry) && <span aria-hidden className="h-2.5" />}
      {showProgress && entry && (
        <ProgressBar
          className="h-2.5"
          value={completed ? max : entry.read}
          max={max}
          ariaLabel={
            completed
              ? t("manga.library.completedProgress")
              : t("manga.library.chapterProgress", { read: entry.read, total })
          }
        />
      )}
    </div>
  );
}
