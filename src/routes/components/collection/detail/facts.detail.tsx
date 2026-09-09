import { formatDate, statusColorOf } from "@/lib/collection/status.utils";
import { useI18n, type TranslationKey } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

export function DetailFactsCollection({
  item,
  statuses,
  statusText,
}: {
  item: CollectionItem;
  statuses: Parameters<typeof statusColorOf>[0];
  statusText: string;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-center gap-1">
        <span
          className="windows95-border h-3 w-3"
          style={{ backgroundColor: statusColorOf(statuses, item.status) }}
        />
        {statusText} {item.isFavorite && `(${t("collection.wizard.favorite")})`}
      </div>
      <div>
        {t("collection.details.type")}: {t(`collection.type.${item.type}` as TranslationKey)}
      </div>
      {item.studio && (
        <div>
          {t("collection.details.studio")}: {item.studio}
        </div>
      )}
      {item.genres.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span>{t("collection.details.genres")}:</span>
          {item.genres.map((genre) => (
            <span key={genre} className="windows95-border bg-white px-1">
              {genre}
            </span>
          ))}
        </div>
      )}
      {item.year && (
        <div>
          {t("collection.details.year")}: {item.year}
        </div>
      )}
      {item.rating != null && item.rating > 0 && (
        <div>
          {t("collection.details.rating")}: {item.rating}/10
        </div>
      )}
      <div>
        {t("collection.details.progress")}: {item.progressValue}
        {item.progressTotal ? `/${item.progressTotal}` : ""} {item.progressUnit}
      </div>
      <div>
        {t("collection.details.priority")}: {item.priority}
      </div>
      {item.durationMinutes != null && (
        <div>
          {t("collection.details.duration")}: {item.durationMinutes}
        </div>
      )}
      {item.startedAt != null && (
        <div>
          {t("collection.details.started")}: {formatDate(item.startedAt)}
        </div>
      )}
      {item.finishedAt != null && (
        <div>
          {t("collection.details.finished")}: {formatDate(item.finishedAt)}
        </div>
      )}
      {item.rewatchCount > 0 && (
        <div>{t("collection.details.rewatched", { count: String(item.rewatchCount) })}</div>
      )}
      {item.localPath && (
        <div className="break-all">
          {t("collection.details.local")}: {item.localPath}
        </div>
      )}
      {item.externalIds.anilist != null && (
        <div>
          {t("collection.details.anilist")}: {item.externalIds.anilist}
        </div>
      )}
      {item.externalIds.tmdb != null && (
        <div>
          {t("collection.details.tmdb")}: {item.externalIds.tmdb}
        </div>
      )}
      {item.externalIds.mal != null && <div>MAL: {item.externalIds.mal}</div>}
      {item.externalIds.imdb && <div>IMDb: {item.externalIds.imdb}</div>}
    </>
  );
}
