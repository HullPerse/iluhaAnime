import { useCell } from "@hullperse/hp_utils/react";
import { ChevronsDown } from "lucide-react";
import { useReaderAutoScroll } from "@/hooks/manga/reader/autoScroll.hook";
import {
  READER_BOTTOM_BAR_REVEAL_ZONE,
  READER_TOP_BAR_REVEAL_ZONE,
  useReaderBar,
} from "@/hooks/manga/reader/bottomBar.hook";
import { useReaderScrollFade } from "@/hooks/manga/reader/scrollFade.hook";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { mangaSources, openMangaChapter } from "@/api/manga.api";
import type { MangaChapter, MangaHit, MangaReaderInput } from "@/api/manga.api";
import TitleBar from "@/components/shared/titlebar.component";
import { SelectPortalContainerContext } from "@/components/ui/select.component";
import { activeMangaServer, readerDisplays } from "@/config/manga/reader.config";
import type { readerModes } from "@/config/manga/reader.config";
import { MANGA_READER_HOTKEYS } from "@/config/settings/keybinds.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useOverlayDialog } from "@/hooks/overlay.hook";
import { useReaderZoomShortcuts } from "@/hooks/manga/reader/zoom.hook";
import { useReaderOverlays } from "@/hooks/manga/reader/overlays.hook";
import { useMangaPreload } from "@/hooks/manga/reader/preload.hook";
import { useReaderLayout } from "@/hooks/manga/reader/layout.hook";
import { manifestKey } from "@/lib/manga/readerQuery.utils";
import { shouldForwardReaderWheel } from "@/lib/manga/readerAuto.utils";
import { readerColors, readerMode } from "@/lib/manga/reader.utils";
import { useReaderProgress } from "@/hooks/manga/reader/progress.hook";
import { settingsAtoms } from "@/store/settings.store";
import { mangaAutoRunning } from "@/store/manga.store";
import { ReaderToolbar } from "@/routes/components/manga/reader/toolbar.reader";
import { ReaderBottomBar } from "@/routes/components/manga/reader/bottomBar.reader";
import { ReaderPreferences } from "@/routes/components/manga/reader/preferences.reader";
import { ReaderStage } from "@/routes/components/manga/reader/stage.reader";
import { ignoreReaderHotkey, runReaderHotkey } from "@/lib/manga/readerHotkeys.utils";

const READER_NAVIGATION_HOTKEYS = MANGA_READER_HOTKEYS.filter(({ id }) => id !== "auto");

const AUTO_CORNER_CLASSES: Record<string, string> = {
  tl: "top-12 left-2",
  tr: "top-12 right-4",
  bl: "bottom-4 left-2",
  br: "bottom-4 right-4",
};

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
  initialPage,
  navigationToken,
  onPosition,
  onHistory,
  onVisitPage,
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
  initialPage?: number;
  navigationToken?: number;
  onPosition?: (page: number) => void;
  onHistory?: (delta: number) => void;
  onVisitPage?: (page: number) => void;
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
  const autoCorner = useCell(settingsAtoms.mangaAutoCorner);
  const panelsAlways = useCell(settingsAtoms.mangaBottomBarAlways);
  const scrollFade = useCell(settingsAtoms.scrollFade);
  const animated = useCell(settingsAtoms.mangaReaderAnimated);
  const readerGap = useCell(settingsAtoms.mangaReaderGap);
  const customTitleBarEnabled = useCell(settingsAtoms.customTitleBarEnabled);
  const [page, setPage] = useState<number>(0);
  const [settings, setSettings] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [stripRestart, setStripRestart] = useState<number>(0);
  const [stripJump, setStripJump] = useState<{ index: number; token: number }>({
    index: 0,
    token: 0,
  });
  const offset = useRef<number>(0);
  const [stripStart, setStripStart] = useState<number>(0);
  const modeRef = useRef<(typeof readerModes)[number]>(mode);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerRef = useRef<HTMLDialogElement>(null);
  const [portalHost, setPortalHost] = useState<HTMLDialogElement | null>(null);
  const attachReader = useCallback((node: HTMLDialogElement | null) => {
    readerRef.current = node;
    setPortalHost(node);
  }, []);
  const settingsButton = useRef<HTMLButtonElement>(null);
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
  const bottomBar = useReaderBar({ always: panelsAlways, pinned: pagePicker });
  const topBar = useReaderBar({ always: panelsAlways, pinned: settings || overlay });
  const { data, error, refetch } = useQuery({
    queryKey: manifestKey(chapter, activeMangaServer),
    queryFn: () => openMangaChapter(chapter, activeMangaServer),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const { strip, pair, spread, rtl, half, end, inspectPage, turnPage, goToPage, counter } =
    useReaderLayout(mode, page, data?.count ?? 0, setPage);
  const resume = useCallback(
    (next: number, _scrollOffset: number) => {
      const restored = 0;
      offset.current = restored;
      setStripStart(restored);
      setPage(initialPage ?? next);
    },
    [initialPage]
  );
  const readerProgress = useReaderProgress({
    chapter,
    chapterKey,
    hit,
    count: data?.count ?? 0,
    mode,
    onResume: resume,
  });
  useReaderScrollFade(readerRef, {
    enabled: scrollFade,
    ready: readerProgress.ready,
  });
  const latest = useRef<ReturnType<typeof useReaderProgress>>(readerProgress);

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
    onPosition?.(page);
    readerProgress.save(page, offset.current, complete && autoMark && loaded ? previousKeys : []);
    action();
  }

  function closePreferences() {
    setSettings(false);
    readerRef.current?.focus();
  }

  function jumpTo(index: number) {
    offset.current = 0;
    setStripStart(0);

    if (strip) setStripJump((current) => ({ index, token: current.token + 1 }));
    goToPage(index);
  }

  const restoreNavigation = useEffectEvent(() => {
    if (initialPage !== undefined) jumpTo(initialPage);
  });
  const restoredNavigation = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!readerProgress.ready || restoredNavigation.current === navigationToken) return;
    restoredNavigation.current = navigationToken;
    restoreNavigation();
  }, [navigationToken, readerProgress.ready]);
  const moveHistory = useEffectEvent((delta: number) => {
    mangaAutoRunning.set(false);
    leave(() => onHistory?.(delta));
  });

  useEffect(() => {
    const node = readerRef.current;

    if (!node) return;
    const key = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.altKey || settings || overlay) return;

      if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;

      if (
        (event.target as HTMLElement).closest(
          "input,textarea,[contenteditable=true],[role=dialog],[role=menu]"
        )
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moveHistory(event.code === "ArrowLeft" ? -1 : 1);
    };

    const mouse = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      event.stopPropagation();

      if ((event.target as HTMLElement).closest("[role=dialog],[role=menu]")) return;

      if (!settings && !overlay) {
        if (event.type === "mouseup") moveHistory(event.button === 3 ? -1 : 1);
      }
    };

    node.addEventListener("keydown", key, true);
    node.addEventListener("mouseup", mouse, true);
    node.addEventListener("mousedown", mouse, true);
    node.addEventListener("auxclick", mouse, true);

    return () => {
      node.removeEventListener("keydown", key, true);
      node.removeEventListener("mouseup", mouse, true);
      node.removeEventListener("mousedown", mouse, true);
      node.removeEventListener("auxclick", mouse, true);
    };
  }, [settings, overlay]);

  useMangaPreload(data, page, nextChapter);
  const auto = useReaderAutoScroll(readerRef, {
    blocked: overlay,
    ready: readerProgress.ready,
    end,
    step: () => step(1),
    next: next ? () => leave(next, true) : undefined,
  });

  function trackPointer(event: ReactPointerEvent<HTMLDialogElement>) {
    if (event.clientY <= READER_TOP_BAR_REVEAL_ZONE) topBar.reveal();

    if (event.clientY >= window.innerHeight - READER_BOTTOM_BAR_REVEAL_ZONE) bottomBar.reveal();
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
    if (event.ctrlKey || event.altKey) return;
    const { target } = event;

    if (!(target instanceof Element) || !shouldForwardReaderWheel(target)) return;
    const scroller = readerRef.current?.querySelector<HTMLElement>("[data-reader-scroll]");

    if (!scroller || scroller.contains(target)) return;
    let unit = 1;

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) unit = 16;
    else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) unit = scroller.clientHeight;
    scroller.scrollBy({ top: event.deltaY * unit, left: event.deltaX * unit });
  }

  useReaderZoomShortcuts(readerRef);

  useResolvedHotkeys(READER_NAVIGATION_HOTKEYS, {
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

  const controls = topBar.shown || settings || overlay;
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
      onPointerMove={trackPointer}
      onFocus={() => topBar.reveal()}
      onWheel={forwardWheel}
    >
      <SelectPortalContainerContext.Provider value={portalHost}>
        <div className="flex h-full min-h-0 flex-col">
          {customTitleBarEnabled && <TitleBar title="iluhaAnime" />}
          <div className="relative min-h-0 flex-1">
            <ReaderStage
              key={stripRestart}
              data={data}
              ready={readerProgress.ready}
              strip={strip}
              current={page}
              initialOffset={stripStart}
              jump={stripJump}
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
            {auto.running && autoCorner !== "off" && (
              <span
                aria-hidden
                data-reader-auto-indicator
                title={t("manga.reader.autoRunning")}
                className={`pointer-events-none absolute z-10 rounded-full border border-white/15 bg-black/45 p-1 text-white/65 backdrop-blur-sm ${AUTO_CORNER_CLASSES[autoCorner] ?? ""}`}
              >
                <ChevronsDown className="size-3.5" />
              </span>
            )}
            <ReaderToolbar
              title={title}
              sourceName={sourceName}
              controls={controls}
              onHoverStart={() => topBar.hold()}
              onHoverEnd={() => topBar.release()}
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
                autoRunning={auto.running}
                onAutoToggle={() => auto.toggle()}
                onDisplayChange={displayChanged}
                onClose={closePreferences}
              />
            )}
            {data && (
              <ReaderBottomBar
                page={page}
                counter={counter}
                count={data.count}
                shown={bottomBar.shown}
                onHoverStart={() => bottomBar.hold()}
                onHoverEnd={() => bottomBar.release()}
                pagePicker={pagePicker}
                openPagePicker={openPagePicker}
                pageButton={pageButton}
                onJump={(index) => {
                  onPosition?.(page);

                  if (onVisitPage) onVisitPage(index);
                  else jumpTo(index);
                }}
                paged={!strip}
                onStep={step}
                rtl={rtl}
              />
            )}
          </div>
        </div>
      </SelectPortalContainerContext.Provider>
    </dialog>
  );
}
