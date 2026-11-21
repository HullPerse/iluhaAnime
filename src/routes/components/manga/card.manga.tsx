import { Heart } from "lucide-react";
import { useId } from "react";

import type { LibraryCopy, MangaStatus } from "@/api/manga.api";
import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/hooks/i18n.hook";
import { mangaSourceStatus } from "@/lib/manga/publication.utils";
import { MangaCover } from "@/routes/components/manga/cover.manga";

const statusColors: Readonly<Record<string, string>> = {
  highlight: "var(--color-highlight)",
  success: "var(--color-success)",
  text: "var(--color-text)",
  warning: "var(--color-fav-gold)",
  destructive: "var(--color-destructive)",
};

export function mangaStatusColor(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return statusColors[color] ?? "var(--color-text)";
}

export const MANGA_STATUS_CHIP_CLASS = "windows95-border inline-block size-2.5 shrink-0";

export function MangaCard({
  title,
  cover,
  mosaic,
  entry,
  status,
  publicationStatus,
  chapters,
  showUnread = false,
  showFavourite = false,
  onOpen,
}: {
  title: string;
  cover: string | null;
  mosaic?: boolean;
  entry?: LibraryCopy;
  status?: MangaStatus;
  publicationStatus?: string | null;
  chapters?: number | null;
  showUnread?: boolean;
  showFavourite?: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const publication = mangaSourceStatus(publicationStatus, t);
  const statusId = useId();
  const unreadId = useId();
  const favouriteId = useId();
  const completed = entry?.status === "completed";
  const unread = showUnread && !completed ? (entry?.unread ?? 0) : 0;
  const unreadLabel = unread > 0 ? t("manga.library.unread", { count: unread }) : undefined;
  const favourite = showFavourite && entry?.favourite;
  const description = [status && statusId, unreadLabel && unreadId, favourite && favouriteId]
    .filter(Boolean)
    .join(" ");
  return (
    <article className="cards-shelf-window">
      <button
        type="button"
        aria-label={title}
        aria-describedby={description}
        title={title}
        onClick={onOpen}
        className="flex min-h-0 flex-1 cursor-pointer flex-col text-start hover:brightness-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span className="cards-shelf-bar w-full gap-1">
          {status && (
            <span
              aria-hidden
              className={MANGA_STATUS_CHIP_CLASS}
              title={status.label}
              style={{ backgroundColor: mangaStatusColor(status.color) }}
            />
          )}
          <span className="flex-1">{title}</span>
          {favourite && (
            <span
              className="ml-auto flex shrink-0 items-center"
              title={t("manga.library.isFavourite")}
              aria-hidden
            >
              <Heart className="size-2.5 fill-red-500 text-white" />
            </span>
          )}
        </span>
        <span className="cards-shelf-art w-full">
          <MangaCover src={cover} mosaic={mosaic} className="aspect-auto h-full" />
          {unreadLabel && (
            <span
              aria-hidden
              className="windows95-small-border bg-secondary text-title-text absolute top-1 right-1 px-1.5 py-0.5 text-xs leading-none font-bold tabular-nums"
              title={unreadLabel}
            >
              {unread}
            </span>
          )}
        </span>
      </button>
      {status && (
        <span id={statusId} className="sr-only">
          {status.label}
        </span>
      )}
      {unreadLabel && (
        <span id={unreadId} className="sr-only">
          {unreadLabel}
        </span>
      )}
      {favourite && (
        <span id={favouriteId} className="sr-only">
          {t("manga.library.isFavourite")}
        </span>
      )}
      <MangaCardFoot
        entry={entry}
        completed={completed}
        publication={publication}
        chapters={chapters}
      />
    </article>
  );
}

function MangaCardFoot({
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
