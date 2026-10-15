import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { EyeOff, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as z from "zod/mini";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { NO_TORRENTS } from "@/config/torrent/common.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { usePlayerDrag } from "@/hooks/player/drag.hook";
import { useWatchedFolderNotifications } from "@/hooks/player/folderNotify.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useTorrentFilesMap, useTorrents } from "@/hooks/torrent/queries.hook";
import { useFolderContentChanged } from "@/hooks/watcher/changes.watcher.hook";
import { shouldIgnoreHotkeys } from "@/lib/hotkeys/filter.hotkeys";
import { focusMainSearch } from "@/lib/hotkeys/focus.hotkeys";
import { folderTreesFromScan, fingerprint } from "@/lib/player/scan.utils";
import { folderScanBus } from "@/lib/player/scanBus.utils";
import {
  allFilePaths,
  buildTree,
  filterTreeByPaths,
  patchTreeFile,
  removeTreeFile,
} from "@/lib/player/tree.utils";
import { filterTreeByHiddenPaths } from "@/lib/player/visibility.utils";
import { queryKeys } from "@/lib/query/keys.utils";
import { useCell } from "@/lib/state/signal.hook";
import { isExtraFile } from "@/lib/torrent/extra.utils";
import { attempt, attemptRetry, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError, showErrorOnce } from "@/lib/utils/notification.utils";
import { createCoalescedRunner } from "@/lib/utils/promise.utils";
import { unwrapOr } from "@/lib/utils/result.utils";
import { parseValue } from "@/lib/utils/schema.utils";
import { patchableVideoChanges, touchesExtensions } from "@/lib/watcher/changes.watcher";
import { WATCHER_DEBOUNCE_MS } from "@/lib/watcher/delay.watcher";
import { normalizePath } from "@/lib/watcher/paths.watcher";
import { cacheAtoms, setFolderTrees as setCachedFolderTrees } from "@/store/cache.store";
import {
  addCategory,
  categoryAtoms,
  removeCategory,
  removeEntriesByFolderPath,
} from "@/store/category.store";
import {
  hidePlayerFolder,
  hidePlayerTorrent,
  patchSettings,
  setPlayerFolderHeight,
  settingsAtoms,
  unhidePlayerFolder,
  unhidePlayerTorrent,
} from "@/store/settings.store";
import type { FolderScanResult, VideoFileEntry } from "@/types/fs";
import type { ScanType, FileSearchResult } from "@/types/player";
import type { FFMPEGStatus } from "@/types/settings";
import type { FolderNode } from "@/types/torrent";
import type { FolderChange } from "@/types/watcher";

import CategoryView from "./components/player/category.player";
import { DraggableFolder } from "./components/player/draggable/folder.draggable";
import { DragOverlayItem } from "./components/player/draggable/overlay.draggable";
import { DraggableTorrent } from "./components/player/draggable/torrent.draggable";
import FFMPEG from "./components/player/ffmpeg.player";
import QueuePanel from "./components/player/queue.player";
import { QueueStrip } from "./components/player/strip.player";
import PlayerVisibilityModal from "./components/player/visibility.player";

const FfprobeSchema = z.boolean();

type PlayerRouteAction = "toggleQueue";

const ROUTE_KEYBINDS: ResolvedHotkeyDef<PlayerRouteAction>[] = [
  { id: "toggleQueue", chord: "KeyQ", repeat: "once", keybindId: "player.toggle.queue" },
];

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
  const watcherDelay = useCell(settingsAtoms.watcherDelay);
  const scanThreads = useCell(settingsAtoms.scanThreads);
  const savedFolderPaths = useCell(settingsAtoms.savedFolderPaths);
  const hiddenPlayerFolders = useCell(settingsAtoms.hiddenPlayerFolders);
  const hiddenPlayerTorrents = useCell(settingsAtoms.hiddenPlayerTorrents);

  const [torrentLoading, setTorrentLoading] = useState<Set<number>>(new Set());

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const drag = usePlayerDrag();
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const [queueOpen, setQueueOpen] = useState(true);
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

  const rebuildRunnerRef = useRef<((task: () => Promise<void>) => Promise<void>) | null>(null);
  if (rebuildRunnerRef.current === null) {
    rebuildRunnerRef.current = createCoalescedRunner();
  }
  const rebuildFileIndex = useCallback(
    async (paths: string[]) => {
      const [, error] = await attempt(
        invokeTyped("rebuild_file_index", {
          paths,
          extensions: videoExtensions,
          threads: scanThreads,
        })
      );
      if (error) {
        reportBackgroundError("folders.rebuild", error);
        if (settingsAtoms.notifyScanErrors.get())
          showErrorOnce("folders-rebuild", t("notification.scan.failed"), error.message);
      }
    },
    [t, videoExtensions, scanThreads]
  );
  const rebuildFileIndexRef = useRef(rebuildFileIndex);
  useEffect(() => {
    rebuildFileIndexRef.current = rebuildFileIndex;
  }, [rebuildFileIndex]);
  const rebuildIndex = useCallback((paths: string[]) => {
    const runner = rebuildRunnerRef.current;
    if (!runner) return Promise.resolve();
    return runner(() => rebuildFileIndexRef.current(paths));
  }, []);

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

    (async () => {
      const done = new Set<string>();
      const runScan = (): Promise<[FolderScanResult[], null] | [null, Error]> =>
        attempt(
          invokeTyped<FolderScanResult[]>("scan_video_folders", {
            paths: savedFolderPaths,
            extensions: videoExtensions,
            threads: scanThreads,
          })
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
        setScanProgress({ current: done.size, total: savedFolderPaths.length });
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
      scannedFingerprint.current = print;
      await rebuildIndex(savedFolderPaths);
      if (cancelled) return;
      setCachedFolderTrees(trees.map((t) => ({ path: t.path, tree: t })));
    })();

    return () => {
      cancelled = true;
    };
  }, [reportScan, savedFolderPaths, t, videoExtensions, scanThreads, rebuildIndex]);

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
        showErrorOnce("folders-watch", t("notification.scan.failed"), String(error));
    });
    return () => {
      invokeTyped("stop_watching_folders").catch((error) =>
        reportBackgroundError("folders.watch.stop", error)
      );
    };
  }, [watchedRoots, t, watcherDelay]);

  const folderScanDisposedRef = useRef(false);
  useEffect(() => {
    folderScanDisposedRef.current = false;
    return () => {
      folderScanDisposedRef.current = true;
    };
  }, []);

  useFolderContentChanged(
    (payload) => {
      if (payload.changes.some((change) => isExtraFile(change.path)))
        queryClient.invalidateQueries({ queryKey: queryKeys.extraFilesScope() });
      if (!touchesExtensions(payload.changes, videoExtensions)) return;
      const libraryRoots = new Set(savedFolderPaths.map(normalizePath));
      const byRoot = new Map<string, FolderChange[]>();
      for (const change of payload.changes) {
        if (!libraryRoots.has(normalizePath(change.root))) continue;
        const bucket = byRoot.get(change.root);
        if (bucket) bucket.push(change);
        else byRoot.set(change.root, [change]);
      }
      if (byRoot.size === 0) return;
      const applyFullScan = (path: string, entries: VideoFileEntry[]) => {
        setFolderTrees((prev) => {
          const next = prev.filter((tree) => tree.path !== path);
          if (entries.length) next.push(buildTree(entries, path));
          setCachedFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
          return next;
        });
        reportScan(
          path,
          entries.map((entry) => entry.path),
          false
        );
      };
      const rescanPath = async (path: string) => {
        const [entries, scanError] = await attempt(
          folderScanBus().fullScan({
            root: path,
            extensions: videoExtensions,
            threads: scanThreads,
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
        applyFullScan(path, entries ?? []);
      };
      const patchRoot = async (root: string, changes: FolderChange[]) => {
        const key = normalizePath(root);
        const upserts = changes.filter((change) => change.kind !== "removed").map((c) => c.path);
        const removals = changes.filter((change) => change.kind === "removed").map((c) => c.path);
        const target = folderTrees.find((tree) => normalizePath(tree.path) === key);
        if (!target) {
          await rescanPath(root);
          return;
        }
        const [outcome, patchError] = await attempt(
          folderScanBus().patchScan({
            root,
            upserts,
            removals,
            extensions: videoExtensions,
            threads: scanThreads,
          })
        );
        if (folderScanDisposedRef.current) return;
        if (patchError || !outcome) {
          if (patchError) {
            reportBackgroundError("folders.patch", patchError);
            if (settingsAtoms.notifyScanErrors.get())
              showErrorOnce("folders-patch", t("notification.scan.failed"), patchError.message);
          }
          await rescanPath(root);
          return;
        }
        if (outcome.kind === "full") {
          applyFullScan(root, outcome.entries);
          return;
        }
        let patched = target;
        for (const path of outcome.removed) {
          const next = removeTreeFile(patched, path);
          if (!next) {
            await rescanPath(root);
            return;
          }
          patched = next;
        }
        for (const entry of outcome.fresh) {
          const next = patchTreeFile(patched, entry);
          if (!next) {
            await rescanPath(root);
            return;
          }
          patched = next;
        }
        if (patched.files.length === 0 && patched.children.length === 0) {
          setFolderTrees((prev) => {
            const next = prev.filter((tree) => normalizePath(tree.path) !== key);
            setCachedFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
            return next;
          });
          return;
        }
        setFolderTrees((prev) => {
          const next = prev.map((tree) => (normalizePath(tree.path) === key ? patched : tree));
          setCachedFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
          return next;
        });
        reportScan(root, allFilePaths(patched), false);
      };
      (async () => {
        await Promise.all(
          [...byRoot.entries()].map(([root, changes]) =>
            patchableVideoChanges(changes, videoExtensions)
              ? patchRoot(root, changes)
              : rescanPath(root)
          )
        );
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
        threads: scanThreads,
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
  }, [folderTrees, t, videoExtensions, scanThreads, rebuildIndex]);

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

        <QueuePanel
          scan={loading ? scanProgress : null}
          open={queueOpen}
          onToggle={() => setQueueOpen((value) => !value)}
        />

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
