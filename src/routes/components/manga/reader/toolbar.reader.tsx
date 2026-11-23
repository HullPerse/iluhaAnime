import { ArrowLeft, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import type { RefObject } from "react";
import type { MangaChapter } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { ChapterPicker } from "@/routes/components/manga/reader/chapterPicker.reader";
import { readerButton } from "@/routes/components/manga/reader/chrome.reader";

export function ReaderToolbar({
  title,
  sourceName,
  controls,
  page,
  count,
  chapters,
  chapterKey,
  chaptersOpen,
  chapterButton,
  openChapterPicker,
  onJumpChapter,
  onBack,
  onPrevious,
  onNext,
  previousEnabled,
  nextEnabled,
  settings,
  settingsButton,
  onToggleSettings,
  animated,
}: {
  title: string;
  sourceName: string | undefined;
  controls: boolean;
  page: number;
  count: number;
  chapters: MangaChapter[];
  chapterKey: string;
  chaptersOpen: boolean;
  chapterButton: RefObject<HTMLButtonElement | null>;
  openChapterPicker: (open: boolean) => void;
  onJumpChapter: (chapter: MangaChapter) => void;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  previousEnabled: boolean;
  nextEnabled: boolean;
  settings: boolean;
  settingsButton: RefObject<HTMLButtonElement | null>;
  onToggleSettings: () => void;
  animated: boolean;
}) {
  const { t } = useI18n();
  const progress = count > 0 ? Math.min(100, ((page + 1) / count) * 100) : 0;
  const motion = animated ? "transition-opacity duration-200 ease-out" : "";

  return (
    <header
      data-reader-chrome
      data-no-wheel
      className={`absolute top-0 right-4 left-0 z-20 border-b border-white/20 bg-black/95 text-white ${motion} ${controls ? "opacity-100" : "opacity-0 focus-within:opacity-100 hover:opacity-100"}`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          className={readerButton}
          aria-label={t("common.back")}
          title={t("common.back")}
          onClick={onBack}
        >
          <ArrowLeft aria-hidden />
        </Button>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-xs leading-tight font-bold" title={title}>
            {title}
          </span>
          <span className="truncate text-xs leading-tight font-normal text-white/60">
            {sourceName}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className={readerButton}
          aria-label={t("manga.reader.previousChapter")}
          title={t("manga.reader.previousChapter")}
          disabled={!previousEnabled}
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <ChapterPicker
          chapters={chapters}
          current={chapterKey}
          open={chaptersOpen}
          onOpenChange={openChapterPicker}
          trigger={chapterButton}
          onJump={onJumpChapter}
        />
        <Button
          size="icon"
          variant="ghost"
          className={readerButton}
          aria-label={t("manga.reader.nextChapter")}
          title={t("manga.reader.nextChapter")}
          disabled={!nextEnabled}
          onClick={onNext}
        >
          <ChevronRight aria-hidden />
        </Button>
        <Button
          ref={settingsButton}
          size="icon"
          variant="ghost"
          className={readerButton}
          aria-expanded={settings}
          aria-label={t("manga.reader.settings")}
          title={t("manga.reader.settings")}
          onClick={onToggleSettings}
        >
          <Settings2 aria-hidden />
        </Button>
      </div>
      {count > 0 && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
          <span className="block h-full bg-white/80" style={{ width: `${progress}%` }} />
        </span>
      )}
    </header>
  );
}
