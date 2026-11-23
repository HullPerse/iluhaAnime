import { MangaCardMenu } from "@/routes/components/manga/card/menu.card";
import { mangaSources } from "@/api/manga.api";
import { Heart } from "lucide-react";
import ProgressBar from "@/components/shared/progress.component";
import { MangaCover } from "@/routes/components/manga/cover.manga";
import { useI18n } from "@/hooks/i18n.hook";
import { mangaRatingMosaic } from "@/lib/manga/nsfw.utils";
import { MangaCard, MANGA_STATUS_CHIP_CLASS } from "@/routes/components/manga/card/tile.card";
import { mangaStatusColor } from "@/lib/manga/statusColor.utils";
import type { LibraryCopy, MangaStatus } from "@/api/manga.api";
import { mangaDetail } from "@/store/manga.store";

export function LibraryEntry({
  item,
  view,
  nsfw,
  status,
}: {
  item: LibraryCopy;
  view: "cards" | "list";
  nsfw: Record<string, boolean>;
  status?: MangaStatus;
}) {
  const { t } = useI18n();
  const metadata = mangaSources.find((source) => source.id === item.source)?.name;
  const total = item.read + item.unread;
  const progressLabel = t("manga.library.chapterProgress", { read: item.read, total });

  function handleOpen() {
    mangaDetail.set({ source: item.source, id: item.mangaId, title: item.title });
  }

  return (
    <li className="min-w-0">
      <MangaCardMenu
        source={item.source}
        hit={{
          id: item.mangaId,
          title: item.title,
          cover: item.cover,
          rating: item.rating,
          suggestive: false,
          aliases: [],
          externalIds: { anilist: null, mal: null },
        }}
      >
        {view === "cards" ? (
          <MangaCard
            title={item.title}
            cover={item.cover}
            entry={item}
            status={status}
            showUnread
            showFavourite
            mosaic={mangaRatingMosaic(item.rating, nsfw, item.source)}
            onOpen={handleOpen}
          />
        ) : (
          <button
            type="button"
            aria-label={item.title}
            className="windows95-text hover:bg-surface focus-visible:bg-surface focus-visible:outline-text flex w-full cursor-pointer items-center gap-3 px-2 py-1.5 text-start focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-dotted"
            onClick={handleOpen}
          >
            <MangaCover
              src={item.cover}
              mosaic={mangaRatingMosaic(item.rating, nsfw, item.source)}
              className="h-14 w-10 shrink-0"
            />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-bold" title={item.title}>
                  {item.title}
                </span>
                {item.favourite && (
                  <Heart
                    role="img"
                    aria-label={t("manga.library.isFavourite")}
                    className="text-highlight size-3 shrink-0 fill-current"
                  />
                )}
              </span>
              <span className="text-hint flex min-w-0 items-center gap-2 text-xs">
                <span className="shrink-0">{metadata}</span>
                {status && (
                  <span className="flex min-w-0 items-center gap-1">
                    <span
                      aria-hidden
                      className={MANGA_STATUS_CHIP_CLASS}
                      style={{ backgroundColor: mangaStatusColor(status.color) }}
                    />
                    <span className="truncate">{status.label}</span>
                  </span>
                )}
              </span>
            </span>
            <span
              className="grid w-28 shrink-0 gap-1 text-right max-[420px]:w-20"
              title={progressLabel}
            >
              <span className="text-xs tabular-nums">
                {item.read} / {total}
              </span>
              <ProgressBar
                className="h-2.5"
                value={item.read}
                max={Math.max(1, total)}
                ariaLabel={progressLabel}
              />
              {item.unread > 0 && (
                <span
                  className="text-hint text-xs tabular-nums"
                  title={t("manga.library.unread", { count: item.unread })}
                >
                  +{t("manga.search.chapters", { count: item.unread })}
                </span>
              )}
            </span>
          </button>
        )}
      </MangaCardMenu>
    </li>
  );
}
