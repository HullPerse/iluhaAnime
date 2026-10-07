import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, EyeOff, Search, Upload, X } from "lucide-react";
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
import { fingerprint } from "@/lib/player/scan.utils";
import { buildTree, filterTreeByPaths } from "@/lib/player/tree.utils";
import { filterTreeByHiddenPaths } from "@/lib/player/visibility.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, attemptSync, reportBackgroundError, withFallback } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError, showErrorOnce } from "@/lib/utils/notification.utils";
import { cacheAtoms, setFolderTrees as setCachedFolderTrees } from "@/store/cache.store";
import {
  addCategory,
  categoryAtoms,
  exportCategories,
  importCategories,
  removeCategory,
  removeEntriesByFolderPath,
} from "@/store/category.store";
import { addNotification as notify } from "@/store/notification.store";
import { hidePlayerFolder, hidePlayerTorrent, patchSettings, setPlayerFolderHeight, settingsAtoms, unhidePlayerFolder, unhidePlayerTorrent } from "@/store/settings.store";
import type { VideoFileEntry } from "@/types/fs";
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

  const rebuildIndex = useCallback(
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

    setScanProgress({ current: 0, total: 0 });

    (async () => {
      const results = await Promise.all(
        savedFolderPaths.map((path) =>
          attempt(
            invokeTyped<VideoFileEntry[]>("scan_video_folder", {
              path,
              extensions: videoExtensions,
            })
          ).then(([entries, error]) => ({ entries, error, path }))
        )
      );
      if (cancelled) return;
      const trees: FolderNode[] = [];
      let done = 0;
      for (const { entries, error, path } of results) {
        done += 1;
        setScanProgress({ current: done, total: savedFolderPaths.length });
        if (error) {
          reportBackgroundError("folders.scan", error);
          if (settingsAtoms.notifyScanErrors.get())
            showErrorOnce("folders-scan", t("notification.scan.failed"), error.message);
        } else {
          reportScan(
            path,
            (entries ?? []).map((entry) => entry.path),
            true
          );
          if (entries?.length) trees.push(buildTree(entries, path));
        }
      }
      if (cancelled) return;
      setFolderTrees(trees);
      setScanProgress(null);
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

  const handleExportCategories = useCallback(() => {
    const [, error] = attemptSync(() => {
      const json = exportCategories();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `iluhaAnime-categories-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
    if (error) {
      notify(t("player.route.create.category"), "error", t("player.category.export.error"));
      return;
    }
    notify(t("player.route.create.category"), "success", t("player.category.export.done"));
  }, [t]);

  const handleImportCategories = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const read = await attempt(file.text());
      if (read[1] || !read[0]) {
        notify(t("player.route.create.category"), "error", t("player.category.import.error"));
        return;
      }
      const [parsed, parseError] = attemptSync((): unknown => JSON.parse(read[0]));
      if (parseError) {
        notify(t("player.route.create.category"), "error", t("player.category.import.error"));
        return;
      }
      const [count, importError] = attemptSync(() => importCategories(parsed));
      if (importError) {
        notify(t("player.route.create.category"), "error", t("player.category.import.error"));
        return;
      }
      notify(
        t("player.route.create.category"),
        "success",
        t("player.category.import.done", { count })
      );
    },
    [t]
  );

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
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                className="size-6"
                title={t("player.category.export")}
                aria-label={t("player.category.export")}
                onClick={handleExportCategories}
              >
                <Download className="size-3" />
              </Button>
              <label
                className="flex size-6 cursor-pointer items-center justify-center border"
                title={t("player.category.import")}
              >
                <Upload className="size-3" />
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    handleImportCategories(event.target.files?.[0] ?? null).catch(() => undefined);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
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
