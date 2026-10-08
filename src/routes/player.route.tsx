import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { EyeOff, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { NO_TORRENTS } from "@/config/torrent/common.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { usePlayerDrag } from "@/hooks/player/drag.hook";
import { useWatchedFolderNotifications } from "@/hooks/player/folderNotify.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { useTorrentFilesMap, useTorrents } from "@/hooks/torrent/queries.hook";
import { folderTreesFromScan, fingerprint } from "@/lib/player/scan.utils";
import { buildTree, filterTreeByPaths } from "@/lib/player/tree.utils";
import { filterTreeByHiddenPaths } from "@/lib/player/visibility.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, reportBackgroundError, withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { createCoalescedRunner } from "@/lib/utils/promise.utils";
import { showError, showErrorOnce } from "@/lib/utils/notification.utils";
import { cacheAtoms, setFolderTrees as setCachedFolderTrees } from "@/store/cache.store";
import {
  addCategory,
  categoryAtoms,
  removeCategory,
  removeEntriesByFolderPath,
} from "@/store/category.store";
import { hidePlayerFolder, hidePlayerTorrent, patchSettings, setPlayerFolderHeight, settingsAtoms, unhidePlayerFolder, unhidePlayerTorrent } from "@/store/settings.store";
import type { FolderScanResult, VideoFileEntry } from "@/types/fs";
import type { ScanType, FileSearchResult } from "@/types/player";
import type { FFMPEGStatus } from "@/types/settings";
import type { FolderNode } from "@/types/torrent";

import CategoryView from "./components/player/category.player";
import { DraggableFolder } from "./components/player/draggable/folder.draggable";
import { DragOverlayItem } from "./components/player/draggable/overlay.draggable";
import { DraggableTorrent } from "./components/player/draggable/torrent.draggable";
import FFMPEG from "./components/player/ffmpeg.player";
import QueuePanel from "./components/player/queue.player";
import { QueueStrip } from "./components/player/strip.player";
import PlayerVisibilityModal from "./components/player/visibility.player";

function PlayerRoute() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data } = useTorrents();
  const torrents = data ?? NO_TORRENTS;
  const scannedFingerprint = useRef<string | null>(null);

  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanType>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const savedFolderPaths = useCell(settingsAtoms.savedFolderPaths);
  const hiddenPlayerFolders = useCell(settingsAtoms.hiddenPlayerFolders);
  const hiddenPlayerTorrents = useCell(settingsAtoms.hiddenPlayerTorrents);

  const [torrentLoading, setTorrentLoading] = useState<Set<number>>(new Set());

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const drag = usePlayerDrag();
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [debouncedSearch] = useDebouncedValue(search.trim(), { wait: 300 });
  const { data: fileSearchData } = useAppQuery("live", {
    queryKey: queryKeys.playerFileSearch(debouncedSearch, videoExtensions),
    queryFn: async () => {
      const [results] = await attempt(
        invokeTyped<FileSearchResult[]>("search_file_index", {
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
    queryFn: () => withFallback(invokeTyped<boolean>("check_ffprobe"), false),
    staleTime: 0,
  });
  const ffmpegStatus: FFMPEGStatus =
    ffmpegOverride ?? (ffprobeOk === undefined ? "checking" : ffprobeOk ? "ok" : "missing");

  const allTorrentIds = useMemo(() => torrents.map((t) => t.id), [torrents]);
  const { files: torrentFilesMap, pendingIds: torrentPendingIds } = useTorrentFilesMap(
    allTorrentIds,
    10000
  );
  useEffect(() => {
    setTorrentLoading((prev) => {
      if (prev.size !== torrentPendingIds.size) return torrentPendingIds;
      for (const id of torrentPendingIds) if (!prev.has(id)) return torrentPendingIds;
      return prev;
    });
  }, [torrentPendingIds]);

  const rebuildRunnerRef = useRef<((task: () => Promise<void>) => Promise<void>) | null>(
    null
  );
  if (rebuildRunnerRef.current === null) {
    rebuildRunnerRef.current = createCoalescedRunner();
  }
  const rebuildFileIndex = useCallback(
    async (paths: string[]) => {
      const [, error] = await attempt(
        invokeTyped("rebuild_file_index", {
          paths,
          extensions: videoExtensions,
        })
      );
      if (error) {
        reportBackgroundError("folders.rebuild", error);
        if (settingsAtoms.notifyScanErrors.get())
          showErrorOnce("folders-rebuild", t("notification.scan.failed"), error.message);
      }
    },
    [t, videoExtensions]
  );
  const rebuildFileIndexRef = useRef(rebuildFileIndex);
  useEffect(() => {
    rebuildFileIndexRef.current = rebuildFileIndex;
  }, [rebuildFileIndex]);
  // Coalesced: player mount fires a cached-trees rebuild and a post-scan
  // rebuild almost simultaneously; without this the two overlapping
  // `rebuild_file_index` commands race inside SQLite (`database is locked`).
  // A trailing call with different paths is remembered and runs once after.
  const rebuildIndex = useCallback(
    (paths: string[]) => {
      const runner = rebuildRunnerRef.current;
      if (!runner) return Promise.resolve();
      return runner(() => rebuildFileIndexRef.current(paths));
    },
    []
  );

  const { reportScan } = useWatchedFolderNotifications(savedFolderPaths, videoExtensions);

  useEffect(() => {
    const cached = cacheAtoms.folderTrees.get();
    if (cached.length > 0) {
      setFolderTrees(cached.map((c) => c.tree));
      rebuildIndex(cached.map((c) => c.path));
    }
  }, [rebuildIndex]);

  useEffect(() => {
    if (savedFolderPaths.length === 0) return;
    let cancelled = false;

    const print = fingerprint(savedFolderPaths, videoExtensions);
    if (print === scannedFingerprint.current) return;

    setScanProgress({ current: 0, total: savedFolderPaths.length });

    // Single batched invoke: the backend walks folders sequentially behind
    // one scan slot, so concurrent saved folders can no longer wedge the
    // shared rayon pool ("thread-pool too busy"). Per-folder `done` events
    // advance the bar while the batch is in flight.
    (async () => {
      const done = new Set<string>();
      const unlisten = await listen<{ path: string; current: number; total: number; done?: boolean }>(
        "folder-scan-progress",
        (event) => {
          if (cancelled || !event.payload.done) return;
          if (!savedFolderPaths.includes(event.payload.path)) return;
          done.add(event.payload.path);
          setScanProgress({ current: done.size, total: savedFolderPaths.length });
        }
      ).catch((error) => {
        reportBackgroundError("folders.scan.progress", error);
        return undefined;
      });
      // eslint-disable-next-line react-doctor/server-sequential-independent-await -- the progress listener above must be attached before the scan starts emitting; sequential order is the correctness mechanism
      const [results, scanError] = await attempt(
        invokeTyped<FolderScanResult[]>("scan_video_folders", {
          paths: savedFolderPaths,
          extensions: videoExtensions,
        })
      );
      unlisten?.();
      if (cancelled) return;
      if (scanError) {
        reportBackgroundError("folders.scan", scanError);
        if (settingsAtoms.notifyScanErrors.get())
          showErrorOnce("folders-scan", t("notification.scan.failed"), scanError.message);
        setScanProgress(null);
        return;
      }
      const trees = folderTreesFromScan(results ?? []);
      for (const result of results ?? []) {
        reportScan(
          result.path,
          result.entries.map((entry) => entry.path),
          true
        );
      }
      setFolderTrees(trees);
      setScanProgress(null);
      // The fingerprint advances only on success: a failed batch retries on
      // the next mount instead of silently sticking to partial trees.
      scannedFingerprint.current = print;
      await rebuildIndex(savedFolderPaths);
      if (cancelled) return;
      setCachedFolderTrees(trees.map((t) => ({ path: t.path, tree: t })));
    })();

    return () => {
      cancelled = true;
    };
  }, [reportScan, savedFolderPaths, t, videoExtensions, rebuildIndex]);

  useEffect(() => {
    if (savedFolderPaths.length === 0) return;
    invokeTyped("start_watching_folders", { folders: savedFolderPaths }).catch((error) => {
      reportBackgroundError("folders.watch.start", error);
      if (settingsAtoms.notifyScanErrors.get())
        showErrorOnce("folders-watch", t("notification.scan.failed"), String(error));
    });
    return () => {
      invokeTyped("stop_watching_folders").catch((error) =>
        reportBackgroundError("folders.watch.stop", error)
      );
    };
  }, [savedFolderPaths, t]);

  const folderScanDisposedRef = useRef(false);
  useEffect(() => {
    folderScanDisposedRef.current = false;
    return () => {
      folderScanDisposedRef.current = true;
    };
  }, []);

  useTauriEvent<string[]>(
    "folder-content-changed",
    (event) => {
      const changed = event.payload;
      queryClient.invalidateQueries({ queryKey: ["extra_files"] });
      const rescanPath = async (path: string) => {
        const [entries, scanError] = await attempt(
          invokeTyped<VideoFileEntry[]>("scan_video_folder", {
            path,
            extensions: videoExtensions,
          })
        );
        if (scanError || folderScanDisposedRef.current) {
          if (scanError) {
            reportBackgroundError("folders.rescan", scanError);
            if (settingsAtoms.notifyScanErrors.get())
              showErrorOnce("folders-rescan", t("notification.scan.failed"), scanError.message);
          }
          return;
        }
        const [, refreshError] = await attempt(
          invokeTyped("refresh_file_index", {
            paths: [path],
            extensions: videoExtensions,
          })
        );
        if (refreshError || folderScanDisposedRef.current) {
          if (refreshError) {
            reportBackgroundError("folders.rescan", refreshError);
            if (settingsAtoms.notifyScanErrors.get())
              showErrorOnce("folders-rescan", t("notification.scan.failed"), refreshError.message);
          }
          return;
        }
        setFolderTrees((prev) => {
          const next = prev.filter((tree) => tree.path !== path);
          if (entries?.length) next.push(buildTree(entries, path));
          setCachedFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
          return next;
        });
        reportScan(
          path,
          (entries ?? []).map((entry) => entry.path),
          false
        );
      };
      (async () => {
        const roots = [...new Set(changed)];
        await Promise.all(roots.map((path) => rescanPath(path)));
      })();
    },
    { errorTag: "folderscan" }
  );

  const handleOpenFolder = useCallback(async () => {
    const folder = await open({ multiple: false, directory: true });
    if (!folder) return;
    if (folderTrees.some((f) => f.path === folder)) return;

    setLoading(true);
    setScanProgress({ current: 0, total: 0 });

    const unlistenPromise = listen<{
      path: string;
      current: number;
      total: number;
    }>("folder-scan-progress", (e) => {
      if (e.payload.path !== folder) return;
      setScanProgress({ current: e.payload.current, total: e.payload.total });
    });

    const [entries, scanError] = await attempt(
      invokeTyped<VideoFileEntry[]>("scan_video_folder", {
        path: folder,
        extensions: videoExtensions,
      })
    );
    if (scanError) {
      reportBackgroundError("folders.scan", scanError);
      if (settingsAtoms.notifyScanErrors.get())
        showError(t("notification.scan.failed"), scanError.message);
    } else if (entries && entries.length > 0) {
      const tree = buildTree(entries, folder);
      const next = [...folderTrees, tree];
      setFolderTrees(next);
      patchSettings({ savedFolderPaths: next.map((t) => t.path) });
      rebuildIndex(next.map((t) => t.path));
      setCachedFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
    }
    const unlisten = await unlistenPromise.catch((error) =>
      reportBackgroundError("folderscan.unlisten", error)
    );
    unlisten?.();
    setLoading(false);
    setScanProgress(null);
  }, [folderTrees, t, videoExtensions, rebuildIndex]);

  const handleRemoveFolder = useCallback(
    (path: string) => {
      removeEntriesByFolderPath(path);
      unhidePlayerFolder(path);
      setFolderTrees((prev) => {
        const next = prev.filter((t) => t.path !== path);
        patchSettings({ savedFolderPaths: next.map((t) => t.path) });
        setPlayerFolderHeight(path, null);
        rebuildIndex(next.map((t) => t.path));
        setCachedFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
        return next;
      });
    },
    [rebuildIndex]
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

  return (
    <DndContext
      sensors={drag.sensors}
      onDragStart={drag.handleDragStart}
      onDragEnd={drag.handleDragEnd}
      onDragCancel={drag.handleDragCancel}
    >
      <div className="flex h-full w-full flex-col gap-1 overflow-y-auto">
        <section className="ui-toolbar ui-panel w-full">
          <Button onClick={handleOpenFolder}>
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

        <section className="ui-toolbar ui-panel w-full">
          <FFMPEG status={ffmpegStatus} setStatus={setFfmpegOverride} />
          <span className="text-hint ml-auto text-xs">v9.0</span>
        </section>

        {!loading && folderTrees.length > 0 && (
          <section className="ui-panel p-1">
            <div className="flex items-center gap-1">
              <Search className="text-hint size-4" />
              <InlineAutocompleteInput
                className="font-bold"
                placeholder={t("player.route.search.folders")}
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

        <QueuePanel scan={loading ? scanProgress : null} />

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

        {!loading && displayTrees.length > 0 && (
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

        {!loading &&
          filteredTorrents.map((item) => (
            <DraggableTorrent
              key={item.id}
              item={item}
              files={torrentFilesMap[item.id]}
              isExpanded={expanded.has(item.id)}
              torrentLoading={torrentLoading.has(item.id)}
              onToggleExpand={() => toggleExpanded(item.id)}
              onHide={() => hidePlayerTorrent(item.info_hash)}
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
          onUnhideFolder={unhidePlayerFolder}
          onUnhideTorrent={unhidePlayerTorrent}
          onClose={() => setShowHiddenItems(false)}
        />
      )}
    </DndContext>
  );
}

export default PlayerRoute;
