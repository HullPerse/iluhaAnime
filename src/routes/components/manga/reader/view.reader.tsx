import { useCell } from "@hullperse/hp_utils/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import { mangaSources, openMangaChapter } from "@/api/manga.api";
import type { MangaChapter, MangaHit, MangaReaderInput } from "@/api/manga.api";
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
import { readerColors, readerMode } from "@/lib/manga/reader.utils";
import { useReaderProgress } from "@/hooks/manga/reader/progress.hook";
import { settingsAtoms } from "@/store/settings.store";
import { ReaderToolbar } from "@/routes/components/manga/reader/toolbar.reader";
import { ReaderBottomBar } from "@/routes/components/manga/reader/bottomBar.reader";
import { ReaderPreferences } from "@/routes/components/manga/reader/preferences.reader";
import { ReaderStage } from "@/routes/components/manga/reader/stage.reader";
import { ignoreReaderHotkey, runReaderHotkey } from "@/lib/manga/readerHotkeys.utils";

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
  const [page, setPage] = useState<number>(0);
  const [settings, setSettings] = useState<boolean>(false);
  const [chrome, setChrome] = useState<boolean>(true);
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

    if (strip) setStripJump((current) => ({ index, token: current.token + 1 }));
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
    const { target } = event;

    if (!(target instanceof Element) || target.closest("[data-reader-ui]")) return;
    const scroller = readerRef.current?.querySelector<HTMLElement>("[data-reader-scroll]");

    if (!scroller || scroller.contains(target)) return;
    let unit = 1;

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) unit = 16;
    else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) unit = scroller.clientHeight;
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
