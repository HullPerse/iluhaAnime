import { mangaSources } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { mangaRatingMosaic } from "@/lib/manga/nsfw.utils";
import { MangaCard } from "@/routes/components/manga/card/tile.card";
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

  function handleOpen() {
    mangaDetail.set({ source: item.source, id: item.mangaId, title: item.title });
  }

  return (
    <li className="min-w-0">
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
        <Button
          aria-label={item.title}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 p-2 text-start whitespace-normal"
          onClick={handleOpen}
        >
          <span className="truncate font-bold">{item.title}</span>
          {item.unread > 0 && (
            <span className="text-hint text-xs tabular-nums">
              {t("manga.library.unread", { count: item.unread })}
            </span>
          )}
          <span className="text-hint col-span-full truncate text-xs">{metadata}</span>
        </Button>
      )}
    </li>
  );
}
