import { useCell } from "@hullperse/hp_utils/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeftRight,
  FileText,
  MousePointerClick,
  Rows3,
  Settings2,
  X,
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ComponentProps, RefObject, WheelEvent as ReactWheelEvent } from "react";

import { fetchMangaPage, mangaSources, openMangaChapter } from "@/api/manga.api";
import type { MangaChapter, MangaHit, MangaReaderInput, MangaServer } from "@/api/manga.api";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { ColorPickerTrigger } from "@/components/ui/color/trigger.color";
import Slider from "@/components/ui/range.component";
import { SelectPortalContainerContext } from "@/components/ui/select.component";
import { MANGA_READER_HOTKEYS } from "@/config/settings/keybinds.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useOverlayDialog } from "@/hooks/overlay.hook";
import { isTextEntryTarget } from "@/lib/core/hotkeys/filterHotkeys.utils";
import { ReaderFrameControl } from "@/routes/components/manga/appearance.manga";
import { useReaderProgress } from "@/hooks/progress.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

const readerModes = ["rtl", "ltr", "vertical", "strip", "book"] as const;
const readerDisplays = ["paged", "strip", "book"] as const;
const readerDirections = ["rtl", "ltr", "vertical"] as const;
const readerTurns = ["edges", "buttons"] as const;
const readerBackgrounds = ["black", "charcoal", "white", "sepia"] as const;
const activeMangaServer: MangaServer = "compressed";
const displayIcons = { paged: FileText, strip: Rows3, book: BookOpen } as const;
const directionIcons = { rtl: ArrowLeft, ltr: ArrowRight, vertical: ArrowDown } as const;
const turnIcons = { edges: MousePointerClick, buttons: ChevronsLeftRight } as const;
const readerPalette: Record<string, { backgroundColor: string; color: string }> = {
  black: { backgroundColor: "#000000", color: "#ffffff" },
  charcoal: { backgroundColor: "#262626", color: "#ffffff" },
  white: { backgroundColor: "#ffffff", color: "#181818" },
  sepia: { backgroundColor: "#ede0c8", color: "#30251d" },
};
const pageFrames = {
  none: "",
  dark: "outline-2 outline-black",
  light: "outline-2 outline-white",
  shadow: "outline-1 outline-black/50 shadow-[0_6px_24px_#0009]",
  win95:
    "border-2 border-t-win-highlight border-l-win-highlight border-r-win-shadow border-b-win-shadow shadow-[0_0_0_1px_#000]",
  gold: "windows95-fav-border shadow-[0_0_0_1px_#000]",
  inset: "shadow-[inset_0_0_0_1px_#ffffff66,inset_0_0_28px_#000a]",
};
const manifestKey = (chapter: MangaReaderInput, server: MangaServer) =>
  [
    "manga",
    "manifest",
    chapter,
    chapter.source === "mangalib" ? settingsAtoms.mangaLibRequestDomain.get() : null,
    chapter.source === "mangalib" ? server : null,
  ] as const;
const pageKey = (key: string, page: number) => ["manga", "page", key, page] as const;
const readerButton =
  "reader-button border border-white/25 bg-black text-white focus-visible:outline-white";

function readerMode(
  display: (typeof readerDisplays)[number],
  direction: (typeof readerDirections)[number]
): (typeof readerModes)[number] {
  return display === "paged" ? direction : display;
}

function readableTextColor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(value)) return "#ffffff";
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 140 ? "#181818" : "#ffffff";
}

function readerColors(background: string, custom: string) {
  if (background === "custom") return { backgroundColor: custom, color: readableTextColor(custom) };
  return readerPalette[background] ?? readerPalette.black;
}

function useDismissOnOutside<T extends HTMLElement>(
  open: boolean,
  ref: RefObject<T | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onDismiss, open, ref]);
}

function bookPair(page: number, count: number) {
  if (page < 1 || page >= count - 1) return undefined;
  const first = page % 2 === 0 ? page - 1 : page;
  return first + 1 < count - 1 ? first : undefined;
}

function ReaderPage({
  manifest,
  page,
  strip,
  half,
  inspect,
  onLoad,
}: {
  manifest: string;
  page: number;
  strip: boolean;
  half?: "left" | "right";
  inspect?: (page: number, wide: boolean) => void;
  onLoad: (page: number) => void;
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const brightness = useCell(settingsAtoms.mangaBrightness);
  const frame = useCell(settingsAtoms.mangaReaderFrame);
  const containerWidth = useCell(settingsAtoms.mangaReaderWidth);
  const zoom = useCell(settingsAtoms.mangaReaderZoom);
  const stripWidth = Math.min(100, (containerWidth * zoom) / 100);
  const { data, error, refetch } = useQuery({
    queryKey: pageKey(manifest, page),
    queryFn: () => fetchMangaPage(manifest, page, setProgress),
    staleTime: 120_000,
    gcTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!data) return;
    const next = URL.createObjectURL(data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data]);
  if (error) {
    return (
      <div role="alert" className="flex min-h-40 items-center justify-center gap-2">
        {t("manga.reader.pageFailed")}
        <Button
          onClick={async () => {
            await refetch();
          }}
        >
          {t("manga.search.retry")}
        </Button>
      </div>
    );
  }
  if (!url) {
    return (
      <div role="status" className="grid min-h-72 place-content-center gap-2 text-center">
        <span>{t("manga.reader.pageLoading")}</span>
        <ProgressBar
          indeterminate={!progress?.total}
          value={progress?.loaded ?? 0}
          max={progress?.total ?? 1}
          className="h-3 w-40"
          ariaLabel={t("manga.reader.pageLoading")}
        />
      </div>
    );
  }
  const split = size && half && size.width > size.height;
  return (
    <span
      style={
        split
          ? {
              overflow: "clip",
              width: `min(100%, ${size.width / 2}px, ${(size.width / size.height) * 50}dvh)`,
            }
          : strip
            ? { width: `${stripWidth}%`, maxWidth: `${(52 * zoom) / 100}rem` }
            : undefined
      }
      className={strip ? "relative mx-auto grid" : "relative block w-full max-w-full"}
    >
      <img
        src={url}
        alt={t("manga.search.page", { page: page + 1 })}
        className="block h-auto w-full"
        onLoad={(event) => {
          const image = event.currentTarget;
          if (!strip) {
            setSize({ width: image.naturalWidth, height: image.naturalHeight });
            inspect?.(page, image.naturalWidth > image.naturalHeight);
          }
          onLoad(page);
        }}
        style={{
          filter: `brightness(${brightness}%)`,
          ...(split && {
            width: "200%",
            maxWidth: "none",
            transform: half === "right" ? "translateX(-50%)" : undefined,
          }),
        }}
      />
      {pageFrames[frame] && (
        <span
          aria-hidden
          data-manga-page-frame={frame}
          className={`pointer-events-none absolute inset-0 ${pageFrames[frame]}`}
        />
      )}
    </span>
  );
}

function Strip({
  current,
  initialOffset,
  count,
  manifest,
  gap,
  onPage,
  onLoad,
}: {
  current: number;
  initialOffset: number;
  count: number;
  manifest: string;
  gap: number;
  onPage: (page: number, offset: number) => void;
  onLoad: (page: number) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const start = useRef({ index: current, offset: initialOffset });
  const list = useVirtualizer({
    count,
    getScrollElement: () => scroll.current,
    estimateSize: () => 800,
    gap,
    overscan: 2,
    onChange: (instance, scrolling) => {
      if (!scrolling) return;
      const offset = instance.scrollOffset ?? 0;
      const height = instance.scrollRect?.height ?? 0;
      if (offset + height >= instance.getTotalSize() - 2) {
        onPage(count - 1, 0);
        return;
      }
      const item = instance.getVirtualItemForOffset(offset + 4);
      if (item) onPage(item.index, Math.max(0, offset - item.start));
    },
  });
  useEffect(() => {
    const { index, offset } = start.current;
    list.scrollToIndex(index);
    if (offset > 0) list.scrollBy(offset);
  }, [list]);
  return (
    <div
      ref={scroll}
      data-manga-strip
      data-reader-scroll
      className="absolute inset-0 overflow-y-auto"
    >
      <div className="relative" style={{ blockSize: list.getTotalSize() }}>
        {list.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={list.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <ReaderPage manifest={manifest} page={item.index} strip onLoad={onLoad} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PagedReader({
  mode,
  page,
  manifest,
  pair,
  spread,
  half,
  inspect,
  step,
  onLoad,
  onOffset,
}: {
  mode: (typeof readerModes)[number];
  page: number;
  manifest: string;
  pair: number | undefined;
  spread: boolean;
  half: "left" | "right" | undefined;
  inspect: (page: number, wide: boolean) => void;
  step: (delta: number) => void;
  onLoad: (page: number) => void;
  onOffset: (offset: number) => void;
}) {
  const { t } = useI18n();
  const zoom = useCell(settingsAtoms.mangaReaderZoom);
  const containerWidth = useCell(settingsAtoms.mangaReaderWidth);
  const turn = useCell(settingsAtoms.mangaReaderTurn);
  const scroll = useRef<HTMLDivElement>(null);
  const lastPage = useRef(page);
  const pageWidth = Math.min(200, (containerWidth * zoom) / 100);
  const rtl = mode === "rtl" || mode === "book";
  const pages = pair === undefined ? [page] : [pair + 1, pair];
  useEffect(() => {
    if (lastPage.current === page) return;
    lastPage.current = page;
    scroll.current?.scrollTo({ top: 0 });
  }, [page]);
  return (
    <div className="absolute inset-0">
      <div
        ref={scroll}
        data-reader-scroll
        className="h-full w-full overflow-auto"
        onScroll={(event) => onOffset(event.currentTarget.scrollTop)}
      >
        <div className="flex min-h-full w-full flex-col">
          <div
            className="mx-auto my-auto flex items-start justify-center"
            style={{ width: `${pageWidth}%` }}
          >
            {pages.map((index) => (
              <div
                key={index}
                className={
                  spread
                    ? "w-1/2 min-w-0 shrink-0"
                    : index === page
                      ? "w-full min-w-0"
                      : "pointer-events-none hidden"
                }
                aria-hidden={!spread && index !== page}
                inert={!spread && index !== page}
              >
                <ReaderPage
                  manifest={manifest}
                  page={index}
                  strip={false}
                  half={half}
                  inspect={inspect}
                  onLoad={onLoad}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {turn === "edges" && (
        <>
          <Button
            className={
              mode === "vertical"
                ? "absolute top-0 left-0 h-1/4 w-full opacity-0 focus-visible:opacity-100"
                : "absolute top-0 left-0 h-full w-1/4 opacity-0 focus-visible:opacity-100"
            }
            onClick={() => step(rtl ? 1 : -1)}
            aria-label={t(rtl ? "common.next" : "common.previous")}
          />
          <Button
            className={
              mode === "vertical"
                ? "absolute bottom-0 left-0 h-1/4 w-full opacity-0 focus-visible:opacity-100"
                : "absolute top-0 right-0 h-full w-1/4 opacity-0 focus-visible:opacity-100"
            }
            onClick={() => step(rtl ? -1 : 1)}
            aria-label={t(rtl ? "common.previous" : "common.next")}
          />
        </>
      )}
    </div>
  );
}

function ChapterPicker({
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

function PageIndicator({
  page,
  counter,
  count,
  open,
  onOpenChange,
  trigger,
  onJump,
}: {
  page: number;
  counter: string | number;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: RefObject<HTMLButtonElement | null>;
  onJump: (page: number) => void;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLButtonElement>(null);
  useDismissOnOutside(open, root, () => onOpenChange(false));
  useEffect(() => {
    if (open) current.current?.scrollIntoView({ block: "center" });
  }, [open]);
  const percent = count > 0 ? Math.min(100, ((page + 1) / count) * 100) : 0;
  return (
    <div
      ref={root}
      className="pointer-events-auto relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onOpenChange(false);
        trigger.current?.focus();
      }}
    >
      {open && (
        <div
          data-reader-ui
          className="ui-panel text-text absolute bottom-full left-1/2 z-20 mb-2 flex w-64 -translate-x-1/2 flex-col text-xs"
        >
          <div className="ui-titlebar justify-between gap-1">
            <span className="truncate">{t("manga.reader.goToPage")}</span>
            <span className="shrink-0 font-normal tabular-nums opacity-80">
              {counter} / {count}
            </span>
          </div>
          <div
            role="group"
            aria-label={t("manga.reader.goToPage")}
            className="grid max-h-[min(24rem,60vh)] grid-cols-6 gap-1 overflow-y-auto p-1.5"
          >
            {Array.from({ length: count }, (_, index) => index).map((index) => (
              <Button
                key={index}
                ref={index === page ? current : undefined}
                autoFocus={index === page}
                variant={index === page ? "outline" : "default"}
                aria-current={index === page ? "true" : undefined}
                aria-label={t("manga.search.page", { page: index + 1 })}
                className="min-h-6 justify-center px-0 tabular-nums"
                onClick={() => {
                  onOpenChange(false);
                  trigger.current?.focus();
                  if (index !== page) onJump(index);
                }}
              >
                {index + 1}
              </Button>
            ))}
          </div>
        </div>
      )}
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-label={t("manga.reader.goToPage")}
        title={t("manga.reader.goToPage")}
        className={`${readerButton} group relative flex min-h-7 min-w-24 items-center justify-center gap-1 overflow-hidden px-2 text-xs tabular-nums hover:border-white/60`}
        onClick={() => onOpenChange(!open)}
      >
        <span>
          {counter} / {count}
        </span>
        <ChevronUp aria-hidden className="size-3 opacity-60 group-hover:opacity-100" />
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-white/20">
          <span className="block h-full bg-white/80" style={{ width: `${percent}%` }} />
        </span>
      </button>
    </div>
  );
}

function ReaderManifestStatus({
  failed,
  onRetry,
}: {
  failed: boolean;
  onRetry: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  return (
    <div
      className="absolute inset-0 grid place-content-center gap-2"
      role={failed ? "alert" : "status"}
    >
      {t(failed ? "manga.reader.pageFailed" : "manga.reader.pageLoading")}
      {failed && (
        <Button variant="ghost" className={readerButton} onClick={onRetry}>
          {t("manga.search.retry")}
        </Button>
      )}
    </div>
  );
}

function ReaderToolbar({
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

function ReaderBottomBar({
  page,
  counter,
  count,
  visible,
  pagePicker,
  openPagePicker,
  pageButton,
  onJump,
  paged,
  onStep,
  rtl,
}: {
  page: number;
  counter: string | number;
  count: number;
  visible: boolean;
  pagePicker: boolean;
  openPagePicker: (open: boolean) => void;
  pageButton: RefObject<HTMLButtonElement | null>;
  onJump: (page: number) => void;
  paged: boolean;
  onStep: (delta: number) => void;
  rtl: boolean;
}) {
  const { t } = useI18n();
  const turnByButtons = useCell(settingsAtoms.mangaReaderTurn) === "buttons";
  const showTurnButtons = turnByButtons && paged;
  const leftEnabled = rtl ? page < count - 1 : page > 0;
  const rightEnabled = rtl ? page > 0 : page < count - 1;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 pb-2">
      {(visible || showTurnButtons) && (
        <div className="pointer-events-auto flex items-center gap-1.5">
          {showTurnButtons && (
            <Button
              variant="ghost"
              className={readerButton}
              disabled={!leftEnabled}
              onClick={() => onStep(rtl ? 1 : -1)}
              aria-label={t(rtl ? "common.next" : "common.previous")}
            >
              <ChevronLeft aria-hidden />
            </Button>
          )}
          <PageIndicator
            page={page}
            counter={counter}
            count={count}
            open={pagePicker}
            onOpenChange={openPagePicker}
            trigger={pageButton}
            onJump={onJump}
          />
          {showTurnButtons && (
            <Button
              variant="ghost"
              className={readerButton}
              disabled={!rightEnabled}
              onClick={() => onStep(rtl ? -1 : 1)}
              aria-label={t(rtl ? "common.previous" : "common.next")}
            >
              <ChevronRight aria-hidden />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ReaderPreferences({
  brightness,
  autoMark,
  onDisplayChange,
  onClose,
}: {
  brightness: number;
  autoMark: boolean;
  onDisplayChange: (display: (typeof readerDisplays)[number]) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const display = useCell(settingsAtoms.mangaReaderDisplay);
  const direction = useCell(settingsAtoms.mangaReaderDirection);
  const turn = useCell(settingsAtoms.mangaReaderTurn);
  const preload = useCell(settingsAtoms.mangaPreload);
  const splitWide = useCell(settingsAtoms.mangaSplitWide);
  const zoom = useCell(settingsAtoms.mangaReaderZoom);
  const containerWidth = useCell(settingsAtoms.mangaReaderWidth);
  const gap = useCell(settingsAtoms.mangaReaderGap);
  const animated = useCell(settingsAtoms.mangaReaderAnimated);
  const [section, setSection] = useState<"reading" | "page" | "background">("reading");
  return (
    <aside
      aria-label={t("manga.reader.settings")}
      data-reader-ui
      className="ui-panel text-text absolute inset-y-0 right-0 z-30 flex w-80 max-w-[calc(100%-1rem)] flex-col overflow-hidden text-xs"
    >
      <header className="ui-titlebar shrink-0 justify-between">
        <h2>{t("manga.reader.settings")}</h2>
        <Button size="icon" className="size-5" onClick={onClose} aria-label={t("common.close")}>
          <X className="size-3" aria-hidden />
        </Button>
      </header>
      <div className="ui-toolbar shrink-0" role="group" aria-label={t("manga.reader.settings")}>
        {(["reading", "page", "background"] as const).map((value) => (
          <Button
            key={value}
            variant={section === value ? "outline" : "default"}
            aria-pressed={section === value}
            className="flex-1"
            onClick={() => setSection(value)}
          >
            {t(`manga.reader.settings.${value}`)}
          </Button>
        ))}
      </div>
      <div className="min-h-0 overflow-y-auto p-2">
        {section === "reading" && (
          <div className="grid gap-3">
            <fieldset className="grid gap-1.5">
              <legend className="pb-1 font-bold">{t("manga.reader.display")}</legend>
              {readerDisplays.map((value) => {
                const Icon = displayIcons[value];
                return (
                  <Button
                    key={value}
                    variant={display === value ? "outline" : "default"}
                    aria-pressed={display === value}
                    className="justify-start gap-1.5 whitespace-normal"
                    onClick={() => {
                      if (display !== value) onDisplayChange(value);
                      patchSettings({ mangaReaderDisplay: value });
                    }}
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    {t(`manga.reader.display.${value}`)}
                  </Button>
                );
              })}
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="pb-1 font-bold">{t("manga.reader.direction")}</legend>
              {readerDirections.map((value) => {
                const Icon = directionIcons[value];
                return (
                  <Button
                    key={value}
                    variant={direction === value ? "outline" : "default"}
                    aria-pressed={direction === value}
                    disabled={display !== "paged"}
                    className="justify-start gap-1.5 whitespace-normal"
                    onClick={() => patchSettings({ mangaReaderDirection: value })}
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    {t(`manga.reader.direction.${value}`)}
                  </Button>
                );
              })}
            </fieldset>
            <fieldset className="grid gap-1.5">
              <legend className="pb-1 font-bold">{t("manga.reader.turn")}</legend>
              {readerTurns.map((value) => {
                const Icon = turnIcons[value];
                return (
                  <Button
                    key={value}
                    variant={turn === value ? "outline" : "default"}
                    aria-pressed={turn === value}
                    disabled={display !== "paged"}
                    className="justify-start gap-1.5 whitespace-normal"
                    onClick={() => patchSettings({ mangaReaderTurn: value })}
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                    {t(`manga.reader.turn.${value}`)}
                  </Button>
                );
              })}
            </fieldset>
            <Slider
              label={t("manga.reader.preload")}
              min={0}
              max={6}
              step={1}
              value={preload}
              onChange={(mangaPreload) => patchSettings({ mangaPreload })}
            />
            <label className="flex items-center gap-2">
              <Checkbox
                checked={autoMark}
                onChange={(mangaAutoMarkRead) => patchSettings({ mangaAutoMarkRead })}
              />
              {t("manga.reader.autoMark")}
            </label>
          </div>
        )}
        {section === "page" && (
          <div className="grid gap-3">
            <ReaderFrameControl />
            <Slider
              label={t("manga.reader.zoom")}
              min={50}
              max={200}
              step={5}
              suffix="%"
              value={zoom}
              onChange={(mangaReaderZoom) => patchSettings({ mangaReaderZoom })}
            />
            <Slider
              label={t("manga.reader.containerWidth")}
              min={40}
              max={100}
              step={5}
              suffix="%"
              value={containerWidth}
              onChange={(mangaReaderWidth) => patchSettings({ mangaReaderWidth })}
            />
            <Slider
              label={t("manga.reader.gap")}
              min={0}
              max={64}
              step={4}
              suffix="px"
              value={gap}
              onChange={(mangaReaderGap) => patchSettings({ mangaReaderGap })}
            />
            <Slider
              label={t("manga.reader.brightness")}
              min={20}
              max={150}
              step={1}
              suffix="%"
              value={brightness}
              onChange={(mangaBrightness) => patchSettings({ mangaBrightness })}
            />
            <label className="flex items-center gap-2">
              <Checkbox
                checked={animated}
                onChange={(mangaReaderAnimated) => patchSettings({ mangaReaderAnimated })}
              />
              {t("manga.reader.animation")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={splitWide}
                onChange={(mangaSplitWide) => patchSettings({ mangaSplitWide })}
              />
              {t("manga.reader.splitWide")}
            </label>
          </div>
        )}
        {section === "background" && <ReaderBackgroundSettings />}
      </div>
    </aside>
  );
}

function ReaderBackgroundSettings() {
  const { t } = useI18n();
  const background = useCell(settingsAtoms.mangaReaderBackground);
  const custom = useCell(settingsAtoms.mangaReaderBackgroundCustom);
  const portal = useContext(SelectPortalContainerContext);
  return (
    <fieldset className="grid grid-cols-2 gap-1.5">
      <legend className="pb-1 font-bold">{t("manga.reader.background")}</legend>
      {readerBackgrounds.map((value) => (
        <Button
          key={value}
          variant={background === value ? "outline" : "default"}
          aria-pressed={background === value}
          className="justify-start gap-1.5"
          onClick={() => patchSettings({ mangaReaderBackground: value })}
        >
          <span
            aria-hidden
            className="size-3 shrink-0 border border-neutral-500"
            style={{ backgroundColor: readerPalette[value].backgroundColor }}
          />
          {t(`manga.reader.background.${value}`)}
        </Button>
      ))}
      <div className="col-span-2 flex items-center gap-1">
        <Button
          variant={background === "custom" ? "outline" : "default"}
          aria-pressed={background === "custom"}
          className="min-w-0 flex-1 justify-start gap-1.5"
          onClick={() => patchSettings({ mangaReaderBackground: "custom" })}
        >
          <span
            aria-hidden
            className="size-3 shrink-0 border border-neutral-500"
            style={{ backgroundColor: custom }}
          />
          {t("manga.reader.background.custom")}
        </Button>
        <ColorPickerTrigger
          container={portal}
          label={t("manga.reader.background.custom")}
          value={custom}
          onChange={(mangaReaderBackgroundCustom) =>
            patchSettings({ mangaReaderBackgroundCustom, mangaReaderBackground: "custom" })
          }
        />
      </div>
    </fieldset>
  );
}

function ignoreReaderHotkey(event: KeyboardEvent, overlay: boolean, settings: boolean) {
  if (overlay) return true;
  return event.code !== "Escape" && (settings || isTextEntryTarget(event.target));
}

function runReaderHotkey(
  action: string,
  options: {
    strip: boolean;
    mode: (typeof readerModes)[number];
    rtl: boolean;
    viewport: HTMLElement | null | undefined;
    step: (delta: number) => void;
  }
) {
  if (options.strip) {
    if (action !== "up" && action !== "down") return;
    options.viewport?.scrollBy(0, (action === "up" ? -1 : 1) * options.viewport.clientHeight * 0.8);
    return;
  }
  if (options.mode === "vertical") {
    if (action === "up" || action === "down") options.step(action === "up" ? -1 : 1);
  } else if (action === "left" || action === "right") {
    options.step((action === "left") === options.rtl ? 1 : -1);
  }
}

function useReaderZoomShortcuts(dialogRef: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const changeZoom = (delta: number) => {
      const current = settingsAtoms.mangaReaderZoom.get();
      const next = Math.min(200, Math.max(50, Math.round(current + delta)));
      if (next !== current) patchSettings({ mangaReaderZoom: next });
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 10 : -10);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key === "0") {
        event.preventDefault();
        patchSettings({ mangaReaderZoom: 100 });
        return;
      }
      const zoomIn = event.key === "+" || event.key === "=";
      const zoomOut = event.key === "-" || event.key === "_";
      if (!zoomIn && !zoomOut) return;
      event.preventDefault();
      changeZoom(zoomIn ? 10 : -10);
    };
    dialog.addEventListener("wheel", onWheel, { passive: false });
    dialog.addEventListener("keydown", onKeyDown, true);
    return () => {
      dialog.removeEventListener("wheel", onWheel);
      dialog.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dialogRef]);
}

function useReaderOverlays() {
  const [pagePicker, setPagePicker] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const pageButton = useRef<HTMLButtonElement>(null);
  const chapterButton = useRef<HTMLButtonElement>(null);
  const overlay = pagePicker || chaptersOpen;
  return {
    pagePicker,
    chaptersOpen,
    overlay,
    pageButton,
    chapterButton,
    openPagePicker(open: boolean) {
      if (open) setChaptersOpen(false);
      setPagePicker(open);
    },
    openChapterPicker(open: boolean) {
      if (open) setPagePicker(false);
      setChaptersOpen(open);
    },
    closeOverlay() {
      if (pagePicker) {
        setPagePicker(false);
        pageButton.current?.focus();
        return true;
      }
      if (chaptersOpen) {
        setChaptersOpen(false);
        chapterButton.current?.focus();
        return true;
      }
      return false;
    },
  };
}

function useMangaPreload(
  data: { key: string; count: number } | undefined,
  page: number,
  nextChapter: MangaReaderInput | undefined
) {
  const queryClient = useQueryClient();
  const preload = useCell(settingsAtoms.mangaPreload);

  useEffect(() => {
    if (!data) return;
    const depth = Math.max(0, Math.min(6, Math.trunc(preload)));
    const preloadPages = (manifest: string, start: number, end: number) => {
      for (let index = start; index < end; index += 1) {
        queryClient.prefetchQuery({
          queryKey: pageKey(manifest, index),
          queryFn: () => fetchMangaPage(manifest, index),
          staleTime: 120_000,
          gcTime: 30_000,
          retry: false,
        });
      }
    };
    preloadPages(data.key, page + 1, Math.min(page + 1 + depth, data.count));
    const remaining = page + 1 + depth - data.count;
    if (remaining <= 0 || !nextChapter) return;
    let active = true;
    const prefetchNext = async () => {
      const manifest = await queryClient.fetchQuery({
        queryKey: manifestKey(nextChapter, activeMangaServer),
        queryFn: () => openMangaChapter(nextChapter, activeMangaServer),
        staleTime: 60_000,
        retry: false,
      });
      if (active) preloadPages(manifest.key, 0, Math.min(remaining, manifest.count));
    };
    prefetchNext().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [data, nextChapter, page, preload, queryClient]);
}

function useReaderLayout(
  mode: (typeof readerModes)[number],
  page: number,
  count: number,
  setPage: (page: number) => void
) {
  const splitWide = useCell(settingsAtoms.mangaSplitWide);
  const [secondHalf, setSecondHalf] = useState(false);
  const [widePages, setWidePages] = useState<Record<number, boolean>>({});
  const strip = mode === "strip";
  const pair = mode === "book" ? bookPair(page, count) : undefined;
  const spread = pair !== undefined && widePages[pair] === false && widePages[pair + 1] === false;
  const rtl = mode === "rtl" || mode === "book";
  const halfSide = secondHalf !== rtl ? "right" : "left";
  const half = splitWide && !strip ? halfSide : undefined;
  const split = half !== undefined && widePages[page] === true;
  const end = page === count - 1 && (!split || secondHalf);
  const counter = pair !== undefined && spread ? `${pair + 1}-${pair + 2}` : page + 1;
  return {
    strip,
    pair,
    spread,
    rtl,
    half,
    end,
    counter,
    inspectPage(index: number, wide: boolean) {
      setWidePages((current) =>
        current[index] === wide ? current : { ...current, [index]: wide }
      );
    },
    goToPage(index: number) {
      if (!count) return;
      setSecondHalf(false);
      setPage(Math.max(0, Math.min(Math.trunc(index), count - 1)));
    },
    turnPage(delta: number) {
      if (!count || strip) return;
      if (split && secondHalf !== delta > 0) {
        setSecondHalf(delta > 0);
        return;
      }
      const edge = spread && pair !== undefined ? pair + Number(delta > 0) : page;
      const target = Math.max(0, Math.min(edge + delta, count - 1));
      if (target === page) return;
      setPage(target);
      setSecondHalf(delta < 0);
    },
  } as const;
}

function ReaderStage({
  data,
  ready,
  strip,
  current,
  initialOffset,
  gap,
  mode,
  pair,
  spread,
  half,
  inspect,
  step,
  failed,
  onRetry,
  onPage,
  onLoad,
  onOffset,
}: {
  data: { key: string; count: number } | undefined;
  ready: boolean;
  strip: boolean;
  current: number;
  initialOffset: number;
  gap: number;
  mode: (typeof readerModes)[number];
  pair: ComponentProps<typeof PagedReader>["pair"];
  spread: ComponentProps<typeof PagedReader>["spread"];
  half: ComponentProps<typeof PagedReader>["half"];
  inspect: ComponentProps<typeof PagedReader>["inspect"];
  step: ComponentProps<typeof PagedReader>["step"];
  failed: boolean;
  onRetry: () => Promise<unknown>;
  onPage: ComponentProps<typeof Strip>["onPage"];
  onLoad: ComponentProps<typeof Strip>["onLoad"];
  onOffset: ComponentProps<typeof PagedReader>["onOffset"];
}) {
  if (!data || !ready) return <ReaderManifestStatus failed={failed} onRetry={onRetry} />;
  return strip ? (
    <Strip
      current={current}
      initialOffset={initialOffset}
      count={data.count}
      manifest={data.key}
      gap={gap}
      onPage={onPage}
      onLoad={onLoad}
    />
  ) : (
    <PagedReader
      mode={mode}
      page={current}
      manifest={data.key}
      pair={pair}
      spread={spread}
      half={half}
      inspect={inspect}
      step={step}
      onLoad={onLoad}
      onOffset={onOffset}
    />
  );
}

function closeReaderView({
  closeOverlay,
  settings,
  closePreferences,
  leave,
  onClose,
}: {
  closeOverlay: () => boolean;
  settings: boolean;
  closePreferences: () => void;
  leave: (action: () => void) => void;
  onClose: () => void;
}) {
  if (closeOverlay()) return;
  if (settings) closePreferences();
  else leave(onClose);
}

export default function MangaReader({
  chapter,
  title,
  hit,
  chapters,
  onJump,
  chapterKey,
  previousKeys,
  previous,
  next,
  nextChapter,
  onClose,
}: {
  chapter: MangaReaderInput;
  title: string;
  hit: MangaHit;
  chapters: MangaChapter[];
  onJump: (chapter: MangaChapter) => void;
  chapterKey: string;
  previousKeys: string[];
  previous: (() => void) | undefined;
  next: (() => void) | undefined;
  nextChapter: MangaReaderInput | undefined;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useOverlayDialog(true);
  const display = useCell(settingsAtoms.mangaReaderDisplay);
  const direction = useCell(settingsAtoms.mangaReaderDirection);
  const mode = readerMode(display, direction);
  const background = useCell(settingsAtoms.mangaReaderBackground);
  const customBackground = useCell(settingsAtoms.mangaReaderBackgroundCustom);
  const brightness = useCell(settingsAtoms.mangaBrightness);
  const autoMark = useCell(settingsAtoms.mangaAutoMarkRead);
  const animated = useCell(settingsAtoms.mangaReaderAnimated);
  const readerGap = useCell(settingsAtoms.mangaReaderGap);
  const [page, setPage] = useState(0);
  const [settings, setSettings] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [stripRestart, setStripRestart] = useState(0);
  const offset = useRef(0);
  const [stripStart, setStripStart] = useState(0);
  const modeRef = useRef(mode);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerRef = useRef<HTMLDialogElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLDialogElement | null>(null);
  const attachReader = useCallback((node: HTMLDialogElement | null) => {
    readerRef.current = node;
    setPortalHost(node);
  }, []);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    pagePicker,
    chaptersOpen,
    overlay,
    pageButton,
    chapterButton,
    openPagePicker,
    openChapterPicker,
    closeOverlay,
  } = useReaderOverlays();
  const { data, error, refetch } = useQuery({
    queryKey: manifestKey(chapter, activeMangaServer),
    queryFn: () => openMangaChapter(chapter, activeMangaServer),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { strip, pair, spread, rtl, half, end, inspectPage, turnPage, goToPage, counter } =
    useReaderLayout(mode, page, data?.count ?? 0, setPage);
  const resume = useCallback((next: number, scrollOffset: number) => {
    const restored = modeRef.current === "strip" ? scrollOffset : 0;
    offset.current = restored;
    setStripStart(restored);
    setPage(next);
  }, []);
  const readerProgress = useReaderProgress({
    chapter,
    chapterKey,
    hit,
    count: data?.count ?? 0,
    mode,
    onResume: resume,
  });
  const latest = useRef(readerProgress);

  useEffect(() => {
    const dialog = readerRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => dialog?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    latest.current = readerProgress;
  }, [readerProgress]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!readerProgress.ready) return;
    const timer = setTimeout(() => latest.current.save(page, offset.current), 1000);
    return () => clearTimeout(timer);
  }, [page, readerProgress.ready]);

  useEffect(() => {
    if (!end || !loaded || !autoMark || !readerProgress.ready) return;
    const timer = setTimeout(() => latest.current.save(page, offset.current, previousKeys), 1500);
    return () => clearTimeout(timer);
  }, [autoMark, end, loaded, page, previousKeys, readerProgress.ready]);

  function pageLoaded(index: number) {
    if (data && index === data.count - 1) setLoaded(true);
  }

  function leave(action: () => void, complete = false) {
    readerProgress.save(page, offset.current, complete && autoMark && loaded ? previousKeys : []);
    action();
  }

  function closePreferences() {
    setSettings(false);
    settingsButton.current?.focus();
  }

  function jumpTo(index: number) {
    offset.current = 0;
    setStripStart(0);
    if (strip) setStripRestart((value) => value + 1);
    goToPage(index);
  }

  useMangaPreload(data, page, nextChapter);

  function showChrome() {
    setChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 2200);
  }

  function step(delta: number) {
    offset.current = 0;
    setStripStart(0);
    turnPage(delta);
  }

  function displayChanged(next: (typeof readerDisplays)[number]) {
    if (next === "strip") setStripStart(offset.current);
    else {
      offset.current = 0;
      setStripStart(0);
    }
    setStripRestart((value) => value + 1);
  }

  function forwardWheel(event: ReactWheelEvent<HTMLDialogElement>) {
    if (event.ctrlKey) return;
    const target = event.target as Element;
    if (target.closest("[data-reader-ui]")) return;
    const scroller = readerRef.current?.querySelector<HTMLElement>("[data-reader-scroll]");
    if (!scroller || scroller.contains(target)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
    scroller.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
  }

  useReaderZoomShortcuts(readerRef);

  useResolvedHotkeys(MANGA_READER_HOTKEYS, {
    target: readerRef,
    capture: true,
    ignore: (event) => ignoreReaderHotkey(event, overlay, settings),
    onAction: (action, event) => {
      event.stopPropagation();
      if (action === "close") {
        closeReaderView({ closeOverlay, settings, closePreferences, leave, onClose });
        return;
      }
      if (settings || overlay) return;
      runReaderHotkey(action, {
        strip,
        mode,
        rtl,
        viewport: readerRef.current?.querySelector<HTMLElement>("[data-manga-strip]"),
        step,
      });
    },
  });

  const controls = chrome || settings || overlay;
  const sourceName = mangaSources.find(({ id }) => id === chapter.source)?.name;
  return (
    <dialog
      ref={attachReader}
      tabIndex={-1}
      aria-label={t("manga.reader.title")}
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none overflow-clip border-0 p-0 backdrop:bg-black"
      style={readerColors(background, customBackground)}
      data-hotkeys-disabled
      data-vim-layer
      onCancel={(event) => {
        event.preventDefault();
        closeReaderView({ closeOverlay, settings, closePreferences, leave, onClose });
      }}
      onPointerMove={showChrome}
      onFocus={showChrome}
      onWheel={forwardWheel}
    >
      <SelectPortalContainerContext.Provider value={portalHost}>
        <ReaderStage
          key={stripRestart}
          data={data}
          ready={readerProgress.ready}
          strip={strip}
          current={page}
          initialOffset={stripStart}
          gap={readerGap}
          mode={mode}
          pair={pair}
          spread={spread}
          half={half}
          inspect={inspectPage}
          step={step}
          failed={error !== null}
          onRetry={() => refetch()}
          onPage={(next, position) => {
            offset.current = position;
            setPage(next);
            if (scrollTimer.current) clearTimeout(scrollTimer.current);
            scrollTimer.current = setTimeout(() => latest.current.save(next, position), 1000);
          }}
          onLoad={pageLoaded}
          onOffset={(position) => {
            offset.current = position;
          }}
        />
        <ReaderToolbar
          title={title}
          sourceName={sourceName}
          controls={controls}
          page={page}
          count={data?.count ?? 0}
          chapters={chapters}
          chapterKey={chapterKey}
          chaptersOpen={chaptersOpen}
          chapterButton={chapterButton}
          openChapterPicker={openChapterPicker}
          onJumpChapter={(target) => leave(() => onJump(target))}
          onBack={() => leave(onClose)}
          onPrevious={() => previous && leave(previous)}
          onNext={() => next && leave(next, true)}
          previousEnabled={previous !== undefined}
          nextEnabled={next !== undefined}
          settings={settings}
          settingsButton={settingsButton}
          onToggleSettings={() => (settings ? closePreferences() : setSettings(true))}
          animated={animated}
        />
        {readerProgress.failed && (
          <p role="status" className="absolute top-14 right-2 bg-black p-1 text-xs text-white">
            {t("manga.reader.positionFailed")}
          </p>
        )}
        {settings && (
          <ReaderPreferences
            brightness={brightness}
            autoMark={autoMark}
            onDisplayChange={displayChanged}
            onClose={closePreferences}
          />
        )}
        {data && (
          <ReaderBottomBar
            page={page}
            counter={counter}
            count={data.count}
            visible={controls}
            pagePicker={pagePicker}
            openPagePicker={openPagePicker}
            pageButton={pageButton}
            onJump={jumpTo}
            paged={!strip}
            onStep={step}
            rtl={rtl}
          />
        )}
      </SelectPortalContainerContext.Provider>
    </dialog>
  );
}
