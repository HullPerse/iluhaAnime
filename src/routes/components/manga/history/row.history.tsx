import { MangaCardMenu } from "@/routes/components/manga/card/menu.card";
import { ChevronRight } from "lucide-react";

import { mangaSources } from "@/api/manga.api";
import { useI18n } from "@/hooks/i18n.hook";
import { timeZone } from "@/lib/manga/history.utils";
import { mangaRatingMosaic } from "@/lib/manga/nsfw.utils";
import { MangaCover } from "@/routes/components/manga/cover.manga";
import { mangaDetail } from "@/store/manga.store";
import type { HistoryEntry } from "@/types/manga/history";

export function HistoryRow({ row, nsfw }: { row: HistoryEntry; nsfw: Record<string, boolean> }) {
  const { t } = useI18n();
  const source = mangaSources.find(({ id }) => id === row.source);
  const chapter = t("manga.details.chapter", { number: row.chapterKey });
  const opened = new Date(row.openedAt);

  return (
    <li>
      <MangaCardMenu
        source={row.source}
        hit={{
          id: row.mangaId,
          title: row.title,
          cover: row.cover ?? null,
          rating: row.rating ?? "safe",
          suggestive: false,
          aliases: [],
          externalIds: { anilist: null, mal: null },
        }}
      >
        <button
          type="button"
          aria-label={`${row.title} - ${chapter}`}
          className="windows95-text hover:bg-field focus-visible:bg-field focus-visible:outline-text flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-start focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-dotted"
          onClick={() =>
            mangaDetail.set({
              source: row.source,
              id: row.mangaId,
              title: row.title,
              chapterKey: row.chapterKey,
              chapterId: row.chapterId,
            })
          }
        >
          <MangaCover
            src={row.cover ?? null}
            mosaic={mangaRatingMosaic(row.rating, nsfw, row.source)}
            className="windows95-small-border w-10 shrink-0"
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-bold" title={row.title}>
              {row.title}
            </span>
            <span className="text-hint truncate">
              {chapter}
              {source && <small className="text-[0.9em]">, {source.name}</small>}
            </span>
          </span>
          <time dateTime={opened.toISOString()} className="text-hint shrink-0 tabular-nums">
            {opened.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", timeZone })}
          </time>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </button>
      </MangaCardMenu>
    </li>
  );
}
