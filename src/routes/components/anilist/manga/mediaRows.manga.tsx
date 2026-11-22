import { mangaListStatuses } from "@/config/manga/tracking.config";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { openTrackedManga } from "@/store/anilistManga.store";
import type { AniListEntry, AniMedia } from "@/types/anilist/anilist";

export function MediaRows({
  media,
  entries,
}: {
  media: AniMedia[];
  entries: Map<number, AniListEntry>;
}) {
  const { t } = useI18n();

  return (
    <ul className="divide-muted divide-y">
      {media.map((row) => {
        const entry = entries.get(row.id);
        const statusKey = mangaListStatuses.find(([id]) => id === entry?.list_status)?.[1];

        return (
          <li
            key={row.id}
            className="grid min-w-0 grid-cols-[minmax(8rem,1fr)_auto] items-center gap-2 p-1 text-xs"
          >
            <Button
              className="justify-start text-start whitespace-normal"
              onClick={() => openTrackedManga(row.id, row.title)}
            >
              {row.title}
            </Button>
            <span className="text-hint tabular-nums">
              {t("manga.tracking.counts", {
                chapters: entry?.progress ?? row.chapters ?? "-",
                volumes: entry?.progress_volumes ?? row.volumes ?? "-",
              })}
              {statusKey && ` - ${t(statusKey)}`}
              {(entry?.score ?? row.score) != null && ` - ${entry?.score ?? row.score}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
