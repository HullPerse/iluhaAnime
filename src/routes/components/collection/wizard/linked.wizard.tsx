import { useI18n } from "@/lib/i18n";
import type { CollectionItem } from "@/types/collection";

export function WizardLinkedIds({
  externalIds,
}: {
  externalIds: CollectionItem["externalIds"];
}) {
  const { t } = useI18n();
  const hasAny =
    externalIds.anilist != null ||
    externalIds.tmdb != null ||
    externalIds.mal != null ||
    externalIds.imdb;
  if (!hasAny) return null;
  return (
    <div className="text-hint flex flex-wrap items-center gap-1 text-xs">
      <span className="font-bold">{t("collection.wizard.linked")}</span>
      {externalIds.anilist != null && (
        <span className="bg-secondary px-1 text-white">
          AniList {externalIds.anilist}
        </span>
      )}
      {externalIds.tmdb != null && (
        <span className="bg-secondary px-1 text-white">
          TMDB {externalIds.tmdb}
        </span>
      )}
      {externalIds.mal != null && (
        <span className="windows95-border bg-white px-1">
          MAL {externalIds.mal}
        </span>
      )}
      {externalIds.imdb && (
        <span className="windows95-border bg-white px-1">
          IMDb {externalIds.imdb}
        </span>
      )}
    </div>
  );
}