import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { MangaChapter } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useDismissOnOutside } from "@/hooks/manga/reader/dismiss.hook";
import { readerButton } from "@/routes/components/manga/reader/chrome.reader";

export function ChapterPicker({
  chapters,
  current,
  open,
  onOpenChange,
  trigger,
  onJump,
}: {
  chapters: MangaChapter[];
  current: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>;
  onJump: (chapter: MangaChapter) => void;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLButtonElement>(null);
  useDismissOnOutside(open, root, () => onOpenChange(false));
  useEffect(() => {
    if (open) selected.current?.scrollIntoView({ block: "center" });
  }, [open]);
  const label = (chapter: MangaChapter) =>
    chapter.number
      ? t("manga.details.chapter", { number: chapter.number })
      : t("manga.details.special");
  const active = chapters.find((chapter) => chapter.key === current);

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        trigger.current?.focus();
      }}
    >
      <Button
        ref={trigger}
        variant="ghost"
        aria-expanded={open}
        aria-label={t("manga.reader.chapterSelect")}
        title={t("manga.reader.chapterSelect")}
        className={`${readerButton} h-[var(--ui-icon-size)] max-w-44 justify-between gap-1.5 px-2`}
        onClick={() => onOpenChange(!open)}
      >
        <span className="min-w-0 truncate">
          {active ? label(active) : t("manga.tracking.chapters")}
        </span>
        <ChevronDown aria-hidden className="size-3 shrink-0" />
      </Button>
      {open && (
        <div
          data-reader-ui
          className="ui-panel text-text absolute top-full right-0 z-30 mt-1 flex max-h-72 w-56 flex-col text-xs"
        >
          <div className="ui-titlebar shrink-0 justify-between gap-1">
            <span className="truncate">{t("manga.tracking.chapters")}</span>
            <span className="shrink-0 font-normal tabular-nums opacity-80">{chapters.length}</span>
          </div>
          <ul className="min-h-0 overflow-y-auto p-1">
            {chapters.map((chapter) => (
              <li key={chapter.key}>
                <Button
                  ref={chapter.key === current ? selected : undefined}
                  variant={chapter.key === current ? "outline" : "default"}
                  aria-current={chapter.key === current ? "true" : undefined}
                  className="w-full justify-start whitespace-normal"
                  title={chapter.title ?? undefined}
                  onClick={() => {
                    onOpenChange(false);

                    if (chapter.key !== current) onJump(chapter);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{label(chapter)}</span>
                  {chapter.key === current && <Check aria-hidden className="size-3 shrink-0" />}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
