import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { EyeOff, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useDebounce } from "@/hooks/debounce.hook";
import { usePolling } from "@/hooks/polling.hook";
import { useSearchField } from "@/hooks/search/field.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import { buildTree, filterTreeByPaths } from "@/lib/player/tree.utils";
import { filterTreeByHiddenPaths } from "@/lib/player/visibility.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useCacheStore } from "@/store/cache.store";
import { useCategoryStore } from "@/store/category.store";
import { useTorrentStore } from "@/store/download.store";
import { useJobsStore } from "@/store/jobs.store";
import { useSettingsStore } from "@/store/settings.store";
import type { FolderNode, VideoFileEntry, FFMPEGStatus, ScanType, FileSearchResult } from "@/types";
import type { CategoryDragData } from "@/types/category";

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
  const torrents = useTorrentStore((state) => state.torrents);
  const torrentFilesMap = useTorrentStore((state) => state.torrentFilesMap);

  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanType>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<FFMPEGStatus>("checking");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const videoExtensions = useSettingsStore((s) => s.videoExtensions);
  const savedFolderPaths = useSettingsStore((s) => s.savedFolderPaths);
  const hiddenPlayerFolders = useSettingsStore((s) => s.hiddenPlayerFolders);
  const hiddenPlayerTorrents = useSettingsStore((s) => s.hiddenPlayerTorrents);
  const hidePlayerFolder = useSettingsStore((s) => s.hidePlayerFolder);
  const unhidePlayerFolder = useSettingsStore((s) => s.unhidePlayerFolder);
  const hidePlayerTorrent = useSettingsStore((s) => s.hidePlayerTorrent);
  const unhidePlayerTorrent = useSettingsStore((s) => s.unhidePlayerTorrent);
  const patch = useSettingsStore((s) => s.patch);

  const [torrentLoading, setTorrentLoading] = useState<Set<number>>(new Set());
  const scannedPathsRef = useRef<string[] | null>(null);

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ name: string } | null>(null);
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [, setSearching] = useState(false);
  const debouncedSearch = useDebounce(search.trim(), 300);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++searchRequestRef.current;
    if (!debouncedSearch) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchResults([]);
    invokeTyped<FileSearchResult[]>("search_file_index", {
      query: debouncedSearch,
      extensions: videoExtensions,
      limit: 100,
    })
      .then((results) => {
        if (requestId === searchRequestRef.current) setSearchResults(results);
      })
      .catch(() => {
        if (requestId === searchRequestRef.current) setSearchResults([]);
      })
      .finally(() => {
        if (requestId === searchRequestRef.current) setSearching(false);
      });
  }, [debouncedSearch, videoExtensions]);

  const allCategoryEntries = useCategoryStore((s) => s.entries);
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

  useEffect(() => {
    invokeTyped<boolean>("check_ffprobe")
      .then((ok) => setFfmpegStatus(ok ? "ok" : "missing"))
      .catch(() => setFfmpegStatus("missing"));
  }, []);

  usePolling({
    intervalMs: 5000,
    collectKeys: () => useTorrentStore.getState().torrents.map((t) => t.id),
    shouldFetch: (id) => !useTorrentStore.getState().torrentFilesMap[id],
    fetch: (id) => useTorrentStore.getState().loadTorrentFiles(id),
    onStart: (id) => setTorrentLoading((prev) => new Set(prev).add(id)),
    onSettle: (id) =>
      setTorrentLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
  });

  const rebuildIndex = useCallback(
    async (paths: string[]) => {
      try {
        await invokeTyped("rebuild_file_index", {
          paths,
          extensions: videoExtensions,
        });
      } catch (error) {
        console.warn("rebuild_file_index failed", error);
      }
    },
    [videoExtensions]
  );

  useEffect(() => {
    const cached = useCacheStore.getState().folderTrees;
    if (cached.length > 0) {
      setFolderTrees(cached.map((c) => c.tree));
      rebuildIndex(cached.map((c) => c.path));
    }
  }, [rebuildIndex]);

  useEffect(() => {
    if (savedFolderPaths.length === 0) return;
    let cancelled = false;

    const alreadyScanned =
      scannedPathsRef.current &&
      scannedPathsRef.current.length === savedFolderPaths.length &&
      scannedPathsRef.current.every((p, i) => p === savedFolderPaths[i]);

    if (alreadyScanned) {
      rebuildIndex(savedFolderPaths);
      return;
    }

    setScanProgress({ current: 0, total: 0 });

    (async () => {
      const trees: FolderNode[] = [];
      for (let i = 0; i < savedFolderPaths.length; i++) {
        if (cancelled) return;
        const path = savedFolderPaths[i];
        setScanProgress({ current: i, total: savedFolderPaths.length });
        try {
          const entries = await invokeTyped<VideoFileEntry[]>("scan_video_folder", {
            path,
            extensions: videoExtensions,
          });
          if (!cancelled) {
            if (entries?.length) trees.push(buildTree(entries, path));
          }
        } catch {}
      }
      if (cancelled) return;
      setFolderTrees(trees);
      setScanProgress(null);
      scannedPathsRef.current = [...savedFolderPaths];
      await rebuildIndex(savedFolderPaths);
      if (cancelled) return;
      useCacheStore.getState().setFolderTrees(trees.map((t) => ({ path: t.path, tree: t })));
    })();

    return () => {
      cancelled = true;
    };
  }, [savedFolderPaths, videoExtensions, rebuildIndex]);
  useEffect(() => {
    const jobs = useJobsStore.getState();
    if (loading && scanProgress) {
      const total = Math.max(scanProgress.total, 1);
      jobs.upsertJob({
        id: "folder-scan",
        title:
          scanProgress.total === 0
            ? t("player.scan.counting")
            : t("player.scan.scanning", {
                current: scanProgress.current,
                total: scanProgress.total,
              }),
        stage: "",
        done: scanProgress.current,
        total,
        status: "running",
        failures: [],
      });
    } else if (jobs.jobs["folder-scan"]?.status === "running") {
      jobs.finishJob("folder-scan");
    }
  }, [loading, scanProgress, t]);

  useEffect(() => {
    const paths = useSettingsStore.getState().savedFolderPaths;
    if (paths.length === 0) return;
    invokeTyped("start_watching_folders", { folders: paths }).catch(() => {});
    return () => {
      invokeTyped("stop_watching_folders").catch(() => {});
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<string[]>("folder-content-changed", (event) => {
      const changed = event.payload;
      queryClient.invalidateQueries({ queryKey: ["extra_files"] });
      (async () => {
        for (const path of changed) {
          try {
            const entries = await invokeTyped<VideoFileEntry[]>("scan_video_folder", {
              path,
              extensions: videoExtensions,
            });
            if (!disposed) {
              await invokeTyped("refresh_file_index", {
                paths: [path],
                extensions: videoExtensions,
              });
              setFolderTrees((prev) => {
                const next = prev.filter((tree) => tree.path !== path);
                if (entries?.length) next.push(buildTree(entries, path));
                useCacheStore
                  .getState()
                  .setFolderTrees(next.map((tree) => ({ path: tree.path, tree })));
                return next;
              });
            }
          } catch {}
        }
      })();
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [videoExtensions, queryClient]);

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

    try {
      const entries = await invokeTyped<VideoFileEntry[]>("scan_video_folder", {
        path: folder,
        extensions: videoExtensions,
      });
      if (!entries || entries.length === 0) return;
      const tree = buildTree(entries, folder);
      const next = [...folderTrees, tree];
      setFolderTrees(next);
      patch({ savedFolderPaths: next.map((t) => t.path) });
      rebuildIndex(next.map((t) => t.path));
      useCacheStore.getState().setFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
    } catch (error) {
      console.warn("scan_video_folder failed", error);
    } finally {
      const unlisten = await unlistenPromise.catch(() => {});
      unlisten?.();
      setLoading(false);
      setScanProgress(null);
    }
  }, [folderTrees, videoExtensions, patch, rebuildIndex]);

  const handleRemoveFolder = useCallback(
    (path: string) => {
      setFolderTrees((prev) => {
        const next = prev.filter((t) => t.path !== path);
        patch({ savedFolderPaths: next.map((t) => t.path) });
        useSettingsStore.getState().setPlayerFolderHeight(path, null);
        rebuildIndex(next.map((t) => t.path));
        useCacheStore.getState().setFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
        return next;
      });
    },
    [patch, rebuildIndex]
  );

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const categories = useCategoryStore((s) => s.categories);
  const addCategory = useCategoryStore((s) => s.addCategory);
  const removeCategory = useCategoryStore((s) => s.removeCategory);

  const handleCreateCategory = useCallback(() => {
    addCategory(t("player.route.new.category"));
  }, [addCategory, t]);

  const handleRemoveCategory = useCallback((id: string) => {
    setPendingDeleteCategory(id);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;
    const data = active.data.current as CategoryDragData | undefined;
    if (!data) return;
    useCategoryStore.getState().addEntry(String(over.id), data);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event: DragStartEvent) => {
        const data = event.active.data.current as Partial<CategoryDragData> | undefined;
        setActiveDrag(data?.name ? { name: data.name } : null);
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
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
          <FFMPEG status={ffmpegStatus} setStatus={setFfmpegStatus} />
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

      {activeDrag && (
        <DragOverlay>
          <DragOverlayItem name={activeDrag.name} />
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
