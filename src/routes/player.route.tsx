import { DndContext, DragOverlay } from "@dnd-kit/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { EyeOff, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as z from "zod/mini";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { NO_TORRENTS } from "@/config/system/common.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/types/ui/hotkeys";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { usePlayerDrag } from "@/hooks/player/drag.hook";
import { usePlayerFolderSync } from "@/hooks/player/folderSync.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useTorrentFilesMap, useTorrents } from "@/hooks/torrent/queries.hook";
import { shouldIgnoreHotkeys } from "@/lib/core/hotkeys/filterHotkeys.utils";
import { focusMainSearch } from "@/lib/ui/focusHotkeys.utils";
import { folderTreesFromScan, fingerprint } from "@/lib/core/watchers/scan.utils";
import { buildTree, filterTreeByPaths } from "@/lib/player/playerTree.utils";
import { filterTreeByHiddenPaths } from "@/lib/core/ui/visibility.utils";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { playerVisibility } from "@/lib/player/playerVisibility.utils";
import { isCurrentDownload } from "@/lib/torrent/torrentCommon.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { attempt, attemptRetry, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { invokeTyped, invokeValidated } from "@/lib/core/system/invoke.utils";
import { FileEntryListSchema, FolderScanResultListSchema } from "@/schemas/fileIndex.schema";
import { showError, showErrorOnce } from "@/lib/core/ui/notification.utils";
import { unwrapOr } from "@hullperse/hp_utils/result";
import { parseValue } from "@/lib/core/persistence/schema.utils";
import { WATCHER_DEBOUNCE_MS } from "@/lib/core/watchers/delayWatcher.utils";
import { cacheAtoms, setFolderTrees as setCachedFolderTrees } from "@/store/cache.store";
import {
  addCategory,
  categoryAtoms,
  removeCategory,
  removeEntriesByFolderPath,
} from "@/store/category.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { FolderScanResult } from "@/types/core/fs";
import type { ScanType, FileSearchResult } from "@/types/player/player";
import type { FFMPEGStatus } from "@/types/ui/settings";
import type { FolderNode } from "@/types/torrent/torrent";

import CategoryView from "@/routes/components/player/category.player";
import { DraggableFolder } from "@/routes/components/player/draggable/folder.draggable";
import { DragOverlayItem } from "@/routes/components/player/draggable/overlay.draggable";
import { DraggableTorrent } from "@/routes/components/player/draggable/torrent.draggable";
import FFMPEG from "@/routes/components/player/ffmpeg.player";
import QueuePanel from "@/routes/components/player/queue.player";
import FolderScanProgress from "@/routes/components/player/scan.player";
import { QueueStrip } from "@/routes/components/player/strip.player";
import PlayerVisibilityModal from "@/routes/components/player/visibility.player";

const FfprobeSchema = z.boolean();

type PlayerRouteAction = "toggleQueue";

const ROUTE_KEYBINDS: ResolvedHotkeyDef<PlayerRouteAction>[] = [
  { id: "toggleQueue", chord: "KeyQ", repeat: "once", keybindId: "player.toggle.queue" },
];

const hidePlayerFolder = (path: string): void => playerVisibility.hidePlayerFolder(path);
const hidePlayerTorrent = (infoHash: string): void => playerVisibility.hidePlayerTorrent(infoHash);

function PlayerRoute() {
  const { t } = useI18n();
  const { data } = useTorrents();
  const torrents = data ?? NO_TORRENTS;
  const scannedFingerprint = useRef<string | null>(null);

  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState<string>("");
  const [scanProgress, setScanProgress] = useState<ScanType | null>(null);
  const [savedScanProgress, setSavedScanProgress] = useState<ScanType | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const watcherDelay = useCell(settingsAtoms.watcherDelay);
  const scanThreads = useCell(settingsAtoms.scanThreads);
  const savedFolderPaths = useCell(settingsAtoms.savedFolderPaths);
  const hiddenPlayerFolders = useCell(settingsAtoms.hiddenPlayerFolders);
  const hiddenPlayerTorrents = useCell(settingsAtoms.hiddenPlayerTorrents);

  const [torrentLoading, setTorrentLoading] = useState<Set<number>>(new Set());

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const drag = usePlayerDrag();
  const [showHiddenItems, setShowHiddenItems] = useState<boolean>(false);
  const [queueOpen, setQueueOpen] = useState<boolean>(true);
  const [debouncedSearch] = useDebouncedValue(search.trim(), { wait: 300 });

  useResolvedHotkeys<"focus-main">(
    [{ id: "focus-main", chord: "ctrl+KeyK", repeat: "once", keybindId: "focus.main" }],
    {
      onAction: () => focusMainSearch(),
    }
  );

  useResolvedHotkeys<PlayerRouteAction>(ROUTE_KEYBINDS, {
    ignore: (event) => shouldIgnoreHotkeys(event.target),
    onAction: (action) => {
      if (action === "toggleQueue") setQueueOpen((value) => !value);
    },
  });

  const { data: fileSearchData } = useAppQuery("live", {
    queryKey: queryKeys.playerFileSearch(debouncedSearch, videoExtensions),
    queryFn: async () => {
      const [results] = await attempt(
        invokeValidated<FileSearchResult[]>("search_file_index", FileEntryListSchema, {
          query: debouncedSearch,
          extensions: videoExtensions,
          limit: 100,
        })
      );

      return results ?? [];
    },
    enabled: !!debouncedSearch,
    staleTime: 0,
  });
  const searchResults = useMemo(() => fileSearchData ?? [], [fileSearchData]);

  const allCategoryEntries = useCell(categoryAtoms.entries);
  const categorizedPaths = useMemo(() => {
    const paths = new Set<string>();

    for (const list of Object.values(allCategoryEntries)) {
      for (const e of list) {
        if (e.type === "folder" && e.folderPath) paths.add(e.folderPath);
      }
    }

    return paths;
  }, [allCategoryEntries]);
  const categorizedHashes = useMemo(() => {
    const hashes = new Set<string>();

    for (const list of Object.values(allCategoryEntries)) {
      for (const e of list) {
        if (e.type === "torrent" && e.infoHash) hashes.add(e.infoHash);
      }
    }

    return hashes;
  }, [allCategoryEntries]);

  const visibleFolderTrees = useMemo(
    () =>
      folderTrees
        .map((tree) => filterTreeByHiddenPaths(tree, hiddenPlayerFolders))
        .filter((tree): tree is FolderNode => tree !== null),
    [folderTrees, hiddenPlayerFolders]
  );

  const field = useSearchField({
    scope: "player",
    query: search,
    setQuery: setSearch,
    extraValues: searchResults.map((result) => ({ kind: "local" as const, value: result.name })),
  });

  const displayTrees = useMemo(() => {
    let trees = visibleFolderTrees;

    if (debouncedSearch) {
      const matchingPaths = new Set(searchResults.map((r) => r.path));
      trees = trees
        .map((t) => filterTreeByPaths(t, matchingPaths))
        .filter((t): t is FolderNode => t !== null);
    }

    return trees.filter((t) => !categorizedPaths.has(t.path));
  }, [visibleFolderTrees, searchResults, debouncedSearch, categorizedPaths]);

  const filteredTorrents = useMemo(
    () =>
      torrents.filter(
        (t) => !categorizedHashes.has(t.info_hash) && !hiddenPlayerTorrents.includes(t.info_hash)
      ),
    [torrents, categorizedHashes, hiddenPlayerTorrents]
  );

  const categoryTorrents = useMemo(
    () => torrents.filter((t) => !hiddenPlayerTorrents.includes(t.info_hash)),
    [torrents, hiddenPlayerTorrents]
  );

  const hiddenFolderItems = useMemo(() => {
    const names = new Map<string, string>();
    const visit = (node: FolderNode) => {
      names.set(node.path, node.name);
      node.children.forEach(visit);
    };

    folderTrees.forEach(visit);

    return hiddenPlayerFolders.map((path) => ({
      path,
      name: names.get(path) ?? path.split(/[\\/]/).filter(Boolean).pop() ?? path,
    }));
  }, [folderTrees, hiddenPlayerFolders]);

  const hiddenTorrentItems = useMemo(
    () =>
      hiddenPlayerTorrents.map((infoHash) => ({
        infoHash,
        name: torrents.find((torrent) => torrent.info_hash === infoHash)?.name ?? infoHash,
      })),
    [hiddenPlayerTorrents, torrents]
  );

  const [ffmpegOverride, setFfmpegOverride] = useState<FFMPEGStatus | null>(null);
  const { data: ffprobeOk } = useAppQuery("live", {
    queryKey: queryKeys.checkFfprobe(),
    queryFn: async () => {
      const [value, error] = await attemptRetry(() => invokeTyped<unknown>("check_ffprobe"), {
        attempts: 2,
        delay: 200,
      });

      if (error !== null) return false;

      return unwrapOr(parseValue(value, FfprobeSchema), false);
    },
    staleTime: 0,
  });
  let probeStatus: FFMPEGStatus = "checking";

  if (ffprobeOk === true) probeStatus = "ok";
  else if (ffprobeOk === false) probeStatus = "missing";
  const ffmpegStatus: FFMPEGStatus = ffmpegOverride ?? probeStatus;

  const allTorrentIds = useMemo(() => torrents.map((t) => t.id), [torrents]);
  const pollingTorrentIds = useMemo(() => {
    const ids = new Set<number>();

    for (const torrent of torrents) {
      if (isCurrentDownload(torrent) || expanded.has(torrent.id)) ids.add(torrent.id);
    }

    return ids;
  }, [expanded, torrents]);
  const { files: torrentFilesMap, pendingIds: torrentPendingIds } = useTorrentFilesMap(
    allTorrentIds,
    10000,
    undefined,
    true,
    pollingTorrentIds
  );
  useEffect(() => {
    setTorrentLoading((prev) => {
      if (prev.size !== torrentPendingIds.size) return torrentPendingIds;

      for (const id of torrentPendingIds) if (!prev.has(id)) return torrentPendingIds;

      return prev;
    });
  }, [torrentPendingIds]);

  useEffect(() => {
    const cached = cacheAtoms.folderTrees.get();

    if (cached.length > 0) setFolderTrees(cached.map((c) => c.tree));
  }, []);

  useEffect(() => {
    if (savedFolderPaths.length === 0) {
      setSavedScanProgress(null);

      return;
    }

    let cancelled = false;

    const print = fingerprint(savedFolderPaths, videoExtensions);

    if (print === scannedFingerprint.current) {
      setSavedScanProgress(null);

      return;
    }

    setSavedScanProgress({ type: "library", current: 0, total: savedFolderPaths.length });

    (async () => {
      const done = new Set<string>();
      const runScan = (): Promise<[FolderScanResult[], null] | [null, Error]> =>
        attempt(
          invokeValidated<FolderScanResult[]>(
            "scan_video_folders_indexed",
            FolderScanResultListSchema,
            {
              paths: savedFolderPaths,
              extensions: videoExtensions,
              threads: scanThreads,
            }
          )
        );
      const scan = listen<{
        path: string;
        current: number;
        total: number;
        done?: boolean;
      }>("folder-scan-progress", (event) => {
        if (cancelled || !event.payload.done) return;

        if (!savedFolderPaths.includes(event.payload.path)) return;
        done.add(event.payload.path);
        setSavedScanProgress({
          type: "library",
          current: done.size,
          total: savedFolderPaths.length,
        });
      })
        .then((unlisten) =>
          runScan().then((outcome) => {
            unlisten();

            return outcome;
          })
        )
        .catch((error: unknown) => {
          reportBackgroundError("folders.scan.progress", error);

          return runScan();
        });
      const [results, scanError] = await scan;

      if (cancelled) return;

      if (scanError) {
        reportBackgroundError("folders.scan", scanError);

        if (settingsAtoms.notifyScanErrors.get())
          showErrorOnce("folders-scan", t("notification.scan.failed"), scanError.message);
        setSavedScanProgress(null);

        return;
      }

      const trees = folderTreesFromScan(results ?? []);
      setFolderTrees(trees);
      setSavedScanProgress(null);
      scannedFingerprint.current = print;

      if (cancelled) return;
      setCachedFolderTrees(trees.map((t) => ({ path: t.path, tree: t })));
    })();

    return () => {
      cancelled = true;
    };
  }, [savedFolderPaths, t, videoExtensions, scanThreads]);

  const torrentSaveDirsKey = useMemo(
    () =>
      [
        ...new Set(
          torrents.map((torrent) => torrent.save_dir).filter((dir): dir is string => !!dir)
        ),
      ]
        .sort()
        .join("\n"),
    [torrents]
  );
  const watchedRoots = useMemo(
    () => [
      ...new Set([
        ...savedFolderPaths,
        ...(torrentSaveDirsKey ? torrentSaveDirsKey.split("\n") : []),
      ]),
    ],
    [savedFolderPaths, torrentSaveDirsKey]
  );

  useEffect(() => {
    if (watchedRoots.length === 0) return;
    invokeTyped("start_watching_folders", {
      folders: watchedRoots,
      debounceMs: WATCHER_DEBOUNCE_MS[watcherDelay],
    }).catch((error) => {
      reportBackgroundError("folders.watch.start", error);

      if (settingsAtoms.notifyScanErrors.get())
        showErrorOnce("folders-scan", t("notification.scan.failed"), String(error));
    });

    return () => {
      invokeTyped("stop_watching_folders").catch((error) =>
        reportBackgroundError("folders.watch.stop", error)
      );
    };
  }, [watchedRoots, t, watcherDelay]);

  usePlayerFolderSync({
    folderTrees,
    setFolderTrees,
    savedFolderPaths,
    videoExtensions,
    scanThreads,
  });

  const handleOpenFolder = useCallback(async () => {
    const folder = await open({ multiple: false, directory: true });

    if (!folder) return;

    if (folderTrees.some((f) => f.path === folder)) return;

    setScanProgress({ type: "folder", path: folder, walked: 0 });
    const [unlisten, listenError] = await attempt(
      listen<{
        path: string;
        current: number;
        total: number;
        done?: boolean;
      }>("folder-scan-progress", (e) => {
        if (e.payload.path !== folder || e.payload.done || e.payload.total > 0) return;
        setScanProgress((current) =>
          current?.type === "folder" &&
          current.path === folder &&
          e.payload.current > current.walked
            ? { ...current, walked: e.payload.current }
            : current
        );
      })
    );

    if (listenError) reportBackgroundError("folders.scan.progress", listenError);
    await (async () => {
      const [results, scanError] = await attempt(
        invokeValidated<FolderScanResult[]>(
          "scan_video_folders_indexed",
          FolderScanResultListSchema,
          {
            paths: [folder],
            extensions: videoExtensions,
            threads: scanThreads,
            merge: true,
          }
        )
      );
      const entries = results?.[0]?.entries ?? [];

      if (scanError) {
        reportBackgroundError("folders.scan", scanError);

        if (settingsAtoms.notifyScanErrors.get())
          showError(t("notification.scan.failed"), scanError.message);
      } else if (entries.length > 0) {
        const tree = buildTree(entries, folder);
        const next = [...folderTrees, tree];
        setFolderTrees(next);
        patchSettings({ savedFolderPaths: next.map((t) => t.path) });

        if (scannedFingerprint.current !== null)
          scannedFingerprint.current = fingerprint(
            next.map((t) => t.path),
            videoExtensions
          );
        setCachedFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
      }
    })().finally(() => {
      setScanProgress(null);
      unlisten?.();
    });
  }, [folderTrees, t, videoExtensions, scanThreads]);

  const handleRemoveFolder = useCallback(
    (path: string) => {
      removeEntriesByFolderPath(path);
      playerVisibility.unhidePlayerFolder(path);
      invokeTyped("remove_file_index_root", { root: path }).catch((error: unknown) =>
        reportBackgroundError("folders.index.remove", error)
      );
      const next = folderTrees.filter((t) => t.path !== path);
      setFolderTrees(next);
      patchSettings({ savedFolderPaths: next.map((t) => t.path) });

      if (scannedFingerprint.current !== null)
        scannedFingerprint.current = fingerprint(
          next.map((t) => t.path),
          videoExtensions
        );
      playerVisibility.setPlayerFolderHeight(path, null);
      setCachedFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
    },
    [folderTrees, videoExtensions]
  );

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  const categories = useCell(categoryAtoms.categories);

  const handleCreateCategory = useCallback(() => {
    addCategory(t("player.route.new.category"));
  }, [t]);

  const handleRemoveCategory = useCallback((id: string) => {
    setPendingDeleteCategory(id);
  }, []);

  const activeScan = scanProgress ?? savedScanProgress;

  return (
    <DndContext
      sensors={drag.sensors}
      onDragStart={drag.handleDragStart}
      onDragEnd={drag.handleDragEnd}
      onDragCancel={drag.handleDragCancel}
    >
      <div className="flex h-full w-full flex-col gap-1 overflow-y-auto">
        <section className="ui-toolbar ui-panel w-full">
          <Button onClick={handleOpenFolder} disabled={activeScan !== null}>
            <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4" />
            {t("player.route.add.folder")}
          </Button>{" "}
          <Button onClick={handleCreateCategory}>
            <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4" />
            {t("player.route.create.category")}
          </Button>
          <Button
            size="icon"
            title={t("player.visibility.manage")}
            onClick={() => setShowHiddenItems(true)}
            className="size-6"
          >
            <EyeOff className="size-3" />
          </Button>
        </section>

        {activeScan !== null && <FolderScanProgress scan={activeScan} />}

        <section className="ui-toolbar ui-panel w-full">
          <FFMPEG status={ffmpegStatus} setStatus={setFfmpegOverride} />
          <span className="text-hint ml-auto text-xs">v9.0</span>
        </section>

        {scanProgress === null && folderTrees.length > 0 && (
          <section className="ui-panel p-1">
            <div className="flex items-center gap-1">
              <Search className="text-hint size-4" />
              <InlineAutocompleteInput
                className="font-bold"
                placeholder={t("player.route.search.folders")}
                data-main-search
                {...field.inputProps}
              />
              {search && (
                <Button size="icon" className="h-5 w-5" onClick={() => setSearch("")}>
                  <X />
                </Button>
              )}
            </div>
          </section>
        )}

        <QueuePanel open={queueOpen} onToggle={() => setQueueOpen((value) => !value)} />

        {categories.length > 0 && (
          <section className="windows95-text flex w-full flex-col gap-2">
            {[...categories]
              .sort((a, b) => a.order - b.order)
              .map((cat) => (
                <CategoryView
                  key={cat.id}
                  categoryId={cat.id}
                  onRemoveCategory={handleRemoveCategory}
                  folderTrees={visibleFolderTrees}
                  torrents={categoryTorrents}
                  torrentFilesMap={torrentFilesMap}
                  onHideFolder={hidePlayerFolder}
                  onHideTorrent={hidePlayerTorrent}
                />
              ))}
          </section>
        )}

        {scanProgress === null && displayTrees.length > 0 && (
          <section className="windows95-text flex w-full flex-col gap-2">
            {displayTrees.map((tree) => (
              <DraggableFolder
                key={tree.path}
                tree={tree}
                onRemove={handleRemoveFolder}
                onHide={hidePlayerFolder}
              />
            ))}
          </section>
        )}

        {scanProgress === null &&
          filteredTorrents.map((item) => (
            <DraggableTorrent
              key={item.id}
              item={item}
              files={torrentFilesMap[item.id]}
              isExpanded={expanded.has(item.id)}
              torrentLoading={torrentLoading.has(item.id)}
              onToggleExpand={toggleExpanded}
              onHide={hidePlayerTorrent}
            />
          ))}
        <QueueStrip />

        {pendingDeleteCategory && (
          <ConfirmDialog
            open
            title={t("player.route.delete.category.title")}
            message={t("player.route.delete.category.message")}
            confirmLabel={t("common.delete")}
            variant="destructive"
            onConfirm={() => {
              removeCategory(pendingDeleteCategory);
              setPendingDeleteCategory(null);
            }}
            onCancel={() => setPendingDeleteCategory(null)}
            onClose={() => setPendingDeleteCategory(null)}
          />
        )}
      </div>

      {drag.activeDrag && (
        <DragOverlay>
          <DragOverlayItem name={drag.activeDrag.name} />
        </DragOverlay>
      )}

      {showHiddenItems && (
        <PlayerVisibilityModal
          folders={hiddenFolderItems}
          torrents={hiddenTorrentItems}
          onUnhideFolder={(path) => playerVisibility.unhidePlayerFolder(path)}
          onUnhideTorrent={(infoHash) => playerVisibility.unhidePlayerTorrent(infoHash)}
          onClose={() => setShowHiddenItems(false)}
        />
      )}
    </DndContext>
  );
}

export default PlayerRoute;
