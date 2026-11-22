import { Lock } from "lucide-react";
import type { MangaChapter } from "@/api/manga.api";
import { useI18n } from "@/hooks/i18n.hook";
import { ChapterReadMenu } from "@/routes/components/manga/detail/chapterReadMenu.detail";

export function ChapterRow({
  chapter,
  selected,
  gap,
  read,
  pending,
  previousKeys,
  onMark,
  onPick,
}: {
  chapter: MangaChapter;
  selected?: MangaChapter;
  gap: boolean;
  read: boolean;
  pending: boolean;
  previousKeys?: string[];
  onMark: (keys: string[], read: boolean) => void;
  onPick: (chapter: MangaChapter) => void;
}) {
  const { t } = useI18n();
  const openable = selected !== undefined && !selected.locked;
  const dimmed = !openable || read;
  const lockLabel =
    selected?.locked === true
      ? [
          t(`manga.details.lock.${selected.lockReason ?? "closed"}`),
          selected.availableAt?.slice(0, 10),
        ]
          .filter(Boolean)
          .join(" - ")
      : null;
  const openChapter = () => {
    if (selected && !selected.locked) onPick(selected);
  };

  return (
    <li
      title={selected === undefined ? t("manga.details.translationMissing") : undefined}
      className="[contain-intrinsic-block-size:auto_2.5rem] [content-visibility:auto]"
    >
      <ChapterReadMenu
        read={read}
        pending={pending}
        onToggle={() => onMark([chapter.key], !read)}
        onMarkPrevious={previousKeys ? () => onMark(previousKeys, true) : undefined}
      >
        <div
          role="button"
          tabIndex={0}
          aria-disabled={!openable}
          className={`data-available:hover:bg-primary flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-1${openable ? " group focus-visible:outline-text cursor-pointer focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-dotted" : ""}`}
          data-available={openable ? "" : undefined}
          onClick={openChapter}
          onKeyDown={(event) => {
            if (!openable) return;

            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openChapter();
          }}
        >
          <div className="flex min-w-[min(100%,10rem)] flex-1 flex-col">
            <span
              className={`${dimmed ? "text-hint" : "font-bold"}${openable ? " group-hover:underline" : ""}`}
            >
              {chapter.number
                ? t("manga.details.chapter", { number: chapter.number })
                : t("manga.details.special")}
            </span>
            {chapter.title && (
              <span
                className={`text-hint wrap-anywhere${openable ? " group-hover:underline" : ""}`}
              >
                {chapter.title}
              </span>
            )}
          </div>
          {lockLabel !== null && (
            <span className="text-hint ml-auto" title={lockLabel} aria-label={lockLabel}>
              <Lock className="size-3" aria-hidden />
            </span>
          )}
        </div>
      </ChapterReadMenu>
      {gap && <p className="text-hint px-2 pb-1">{t("manga.details.gap")}</p>}
    </li>
  );
}
