import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { X, Search } from "lucide-react";
import ImageComponent from "@/components/ui/image.component";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDebounce } from "@/hooks/debounce.hook";
import FFMPEG from "./components/player/ffmpeg.player";
import { useTorrentStore } from "@/store/download.store";
import { useSettingsStore } from "@/store/settings.store";
import QueuePanel from "./components/player/queue.player";
import type {
  FolderNode,
  VideoFileEntry,
  FFMPEGStatus,
  ScanType,
  FileSearchResult,
} from "@/types";

import FolderScanProgress from "./components/player/scan.player";
import { buildTree, filterTreeByPaths } from "@/lib/player.utils";
import { useCacheStore } from "@/store/cache.store";
import { useCategoryStore } from "@/store/category.store";
import CategoryView from "./components/player/category.player";
import {
  DraggableFolder,
  DraggableTorrent,
  DragOverlayItem,
} from "./components/player/draggable.player";
import { ConfirmDialog } from "@/components/shared/confirm.component";

function PlayerRoute() {
  const queryClient = useQueryClient();
  const torrents = useTorrentStore((state) => state.torrents);
  const torrentFilesMap = useTorrentStore((state) => state.torrentFilesMap);

  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanType>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<FFMPEGStatus>("checking");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const videoExtensions = useSettingsStore((s) => s.videoExtensions);
  const savedFolderPaths = useSettingsStore((s) => s.savedFolderPaths);
  const patch = useSettingsStore((s) => s.patch);
  const [torrentLoading, setTorrentLoading] = useState<Set<number>>(new Set());
  const fetchingRef = useRef<Set<number>>(new Set());
  const scannedPathsRef = useRef<string[] | null>(null);

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<
    string | null
  >(null);
  const [activeDrag, setActiveDrag] = useState<{ name: string } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [, setSearching] = useState(false);
  const debouncedSearch = useDebounce(search.trim(), 300);

  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchResults([]);
    invoke<FileSearchResult[]>("search_file_index", {
      query: debouncedSearch,
      extensions: videoExtensions,
      limit: 100,
    })
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
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

  const displayTrees = useMemo(() => {
    let trees = folderTrees;
    if (debouncedSearch) {
      const matchingPaths = new Set(searchResults.map((r) => r.path));
      trees = trees
        .map((t) => filterTreeByPaths(t, matchingPaths))
        .filter((t): t is FolderNode => t !== null);
    }
    return trees.filter((t) => !categorizedPaths.has(t.path));
  }, [folderTrees, searchResults, debouncedSearch, categorizedPaths]);

  const filteredTorrents = useMemo(
    () => torrents.filter((t) => !categorizedHashes.has(t.info_hash)),
    [torrents, categorizedHashes],
  );

  useEffect(() => {
    invoke<boolean>("check_ffprobe")
      .then((ok) => setFfmpegStatus(ok ? "ok" : "missing"))
      .catch(() => setFfmpegStatus("missing"));
  }, []);

  useEffect(() => {
    const loadMissing = () => {
      const state = useTorrentStore.getState();
      state.torrents.forEach((t) => {
        if (!state.torrentFilesMap[t.id] && !fetchingRef.current.has(t.id)) {
          fetchingRef.current.add(t.id);
          setTorrentLoading((prev) => new Set(prev).add(t.id));
          state
            .loadTorrentFiles(t.id)
            .then((success) => {
              if (!success) {
                setTimeout(() => {
                  fetchingRef.current.delete(t.id);
                }, 3000);
              }
            })
            .finally(() => {
              setTorrentLoading((prev) => {
                const next = new Set(prev);
                next.delete(t.id);
                return next;
              });
            });
        }
      });
    };

    loadMissing();
    const interval = setInterval(loadMissing, 5000);
    return () => clearInterval(interval);
  }, []);

  const rebuildIndex = useCallback(
    async (paths: string[]) => {
      try {
        await invoke("rebuild_file_index", {
          paths,
          extensions: videoExtensions,
        });
      } catch {}
    },
    [videoExtensions],
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
        setScanProgress({ current: i, total: savedFolderPaths.length });
        try {
          const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
            path: savedFolderPaths[i],
            extensions: videoExtensions,
          });
          if (entries?.length)
            trees.push(buildTree(entries, savedFolderPaths[i]));
        } catch {}
      }
      setFolderTrees(trees);
      setScanProgress(null);
      scannedPathsRef.current = [...savedFolderPaths];
      await rebuildIndex(savedFolderPaths);
      useCacheStore
        .getState()
        .setFolderTrees(trees.map((t) => ({ path: t.path, tree: t })));
    })();
  }, [savedFolderPaths, videoExtensions, rebuildIndex]);

  useEffect(() => {
    const paths = useSettingsStore.getState().savedFolderPaths;
    if (paths.length === 0) return;
    invoke("start_watching_folders", { folders: paths }).catch(() => {});
    return () => {
      invoke("stop_watching_folders").catch(() => {});
    };
  }, [savedFolderPaths]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string[]>("folder-content-changed", (event) => {
      const changed = event.payload;
      queryClient.invalidateQueries({ queryKey: ["extra_files"] });
      (async () => {
        const ext = videoExtensions;
        for (const p of changed) {
          try {
            const entries = await invoke<VideoFileEntry[]>(
              "scan_video_folder",
              {
                path: p,
                extensions: ext,
              },
            );
            if (entries?.length) {
              setFolderTrees((prev) => {
                const next = prev.filter((t) => t.path !== p);
                next.push(buildTree(entries, p));
                rebuildIndex(next.map((t) => t.path));
                useCacheStore
                  .getState()
                  .setFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
                return next;
              });
            }
          } catch {}
        }
      })();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [videoExtensions]);

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
      const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
        path: folder,
        extensions: videoExtensions,
      });
      if (!entries || entries.length === 0) return;
      const tree = buildTree(entries, folder);
      const next = [...folderTrees, tree];
      setFolderTrees(next);
      patch({ savedFolderPaths: next.map((t) => t.path) });
      rebuildIndex(next.map((t) => t.path));
      useCacheStore
        .getState()
        .setFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
    } catch {
    } finally {
      const unlisten = await unlistenPromise;
      unlisten();
      setLoading(false);
      setScanProgress(null);
    }
  }, [folderTrees, videoExtensions, patch, rebuildIndex]);

  const handleRemoveFolder = useCallback(
    (path: string) => {
      setFolderTrees((prev) => {
        const next = prev.filter((t) => t.path !== path);
        patch({ savedFolderPaths: next.map((t) => t.path) });
        rebuildIndex(next.map((t) => t.path));
        useCacheStore
          .getState()
          .setFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
        return next;
      });
    },
    [patch, rebuildIndex],
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
    addCategory("Новая категория");
  }, [addCategory]);

  const handleRemoveCategory = useCallback((id: string) => {
    setPendingDeleteCategory(id);
  }, []);

  const handleDragEnd = (event: { active: any; over: any }) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;
    const data = active.data.current as
      | { type: "folder"; name: string; folderPath: string }
      | {
          type: "torrent";
          name: string;
          infoHash: string;
          torrentId: number;
          saveDir: string;
          totalBytes: number;
        }
      | undefined;
    if (!data) return;
    useCategoryStore.getState().addEntry(over.id as string, data);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(event) => {
        const data = event.active.data.current as any;
        setActiveDrag(data ? { name: data.name } : null);
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <main className="flex flex-col w-full h-full gap-1 overflow-y-auto">
        <section className="flex flex-row w-full h-8 windows95-active-border bg-primary gap-1 p-1 items-center">
          <Button onClick={handleOpenFolder}>
            <ImageComponent
              src="/images/w2k_folder_closed.ico"
              alt=""
              className="size-4"
            />
            Добавить папку
          </Button>
          <Button onClick={handleCreateCategory}>
            <ImageComponent
              src="/images/w2k_folder_closed.ico"
              alt=""
              className="size-4"
            />
            Создать категорию
          </Button>
        </section>

        <section className="flex flex-row w-full h-8 windows95-active-border bg-primary gap-1 p-1 items-center">
          <FFMPEG status={ffmpegStatus} setStatus={setFfmpegStatus} />
          <span className="ml-auto text-[10px] text-muted">v9.0</span>
        </section>

        {!loading && folderTrees.length > 0 && (
          <section className="windows95-active-border bg-primary p-1">
            <div className="flex items-center gap-1">
              <Search className="size-4 text-muted" />
              <Input
                className="flex-1"
                placeholder="Поиск в папках..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <Button
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setSearch("")}
                >
                  <X />
                </Button>
              )}
            </div>
          </section>
        )}

        {loading && <FolderScanProgress scanProgress={scanProgress} />}

        {categories.length > 0 && (
          <section className="flex flex-col w-full windows95-text gap-2">
            {categories
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((cat) => (
                <CategoryView
                  key={cat.id}
                  categoryId={cat.id}
                  onRemoveCategory={handleRemoveCategory}
                  folderTrees={folderTrees}
                  torrents={torrents}
                  torrentFilesMap={torrentFilesMap}
                  audioExtensions={audioExtensions}
                />
              ))}
          </section>
        )}

        {!loading && displayTrees.length > 0 && (
          <section className="flex flex-col w-full windows95-text gap-2">
            {displayTrees.map((tree) => (
              <DraggableFolder
                key={tree.path}
                tree={tree}
                onRemove={handleRemoveFolder}
                audioExtensions={audioExtensions}
              />
            ))}
          </section>
        )}

        <QueuePanel />

        {!loading &&
          filteredTorrents.map((item) => (
            <DraggableTorrent
              key={item.id}
              item={item}
              files={torrentFilesMap[item.id]}
              isExpanded={expanded.has(item.id)}
              torrentLoading={torrentLoading.has(item.id)}
              onToggleExpand={() => toggleExpanded(item.id)}
            />
          ))}

        {pendingDeleteCategory && (
          <ConfirmDialog
            open
            title="Удаление категории"
            message="Удалить категорию?"
            confirmLabel="Удалить"
            variant="destructive"
            onConfirm={() => {
              removeCategory(pendingDeleteCategory);
              setPendingDeleteCategory(null);
            }}
            onCancel={() => setPendingDeleteCategory(null)}
            onClose={() => setPendingDeleteCategory(null)}
          />
        )}
      </main>

      <DragOverlay>
        {activeDrag ? <DragOverlayItem name={activeDrag.name} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export default PlayerRoute;
