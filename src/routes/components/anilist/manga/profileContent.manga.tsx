import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { openTrackedManga } from "@/store/anilistManga.store";
import type {
  AniActivity,
  AniListEntry,
  AniMangaOverview,
  AniMedia,
  AniUser,
} from "@/types/anilist/anilist";
import { MediaRows } from "@/routes/components/anilist/manga/mediaRows.manga";

export function ProfileContent({
  loading,
  error,
  current,
  entries,
  user,
  isSearching,
  active,
  stats,
  activity,
}: {
  loading: boolean;
  error: boolean;
  current: AniMedia[] | undefined;
  entries: Map<number, AniListEntry>;
  user: AniUser | null | undefined;
  isSearching: boolean;
  active: "lists" | "favourites" | "activity" | "stats";
  stats: AniMangaOverview["statistics"] | undefined;
  activity: AniActivity[] | undefined;
}) {
  const { t } = useI18n();

  return (
    <section className="ui-panel min-h-0 flex-1 overflow-y-auto p-2">
      {loading && <p role="status">{t("manga.library.loading")}</p>}
      {error && <p role="alert">{t("manga.tracking.failed")}</p>}
      {!user && !isSearching && <p>{t("manga.search.empty")}</p>}
      {current?.length === 0 && !loading && <p>{t("manga.search.noResults")}</p>}
      {current && <MediaRows media={current} entries={entries} />}
      {!isSearching && active === "stats" && stats && (
        <div className="grid gap-2">
          <p>
            {t("manga.tracking.statsSummary", {
              count: stats.count,
              chapters: stats.chapters,
              volumes: stats.volumes,
              meanScore: stats.meanScore,
            })}
          </p>
          {(["statuses", "formats", "genres", "years"] as const).map((key) => (
            <section key={key} aria-label={t(`manga.tracking.stats.${key}`)}>
              <h2 className="font-bold">{t(`manga.tracking.stats.${key}`)}</h2>
              <ul>
                {stats[key].map(({ label, count }) => (
                  <li key={label}>
                    {label} - {count}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {!isSearching && active === "activity" && activity && (
        <ul className="divide-muted divide-y">
          {activity.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-2 py-1">
              <span>{entry.user_name}</span>
              {entry.media_id && entry.media_title && (
                <Button
                  onClick={() => {
                    if (entry.media_id && entry.media_title)
                      openTrackedManga(entry.media_id, entry.media_title);
                  }}
                >
                  {entry.media_title}
                </Button>
              )}
              {entry.progress && <span>{entry.progress}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
