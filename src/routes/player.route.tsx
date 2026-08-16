import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { EyeOff, FolderOpen, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
} from "react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useDebounce } from "@/hooks/debounce.hook";
import { useUnifiedIndexSuggestions } from "@/hooks/unified.index.hook";
import { parseVaultFilename } from "@/lib/anime.vault";
import { useI18n } from "@/lib/i18n";
import { buildTree, filterTreeByPaths } from "@/lib/player.utils";
import { filterTreeByHiddenPaths } from "@/lib/player.visibility";
import {
  getInlineCompletion,
  getSearchSuggestions,
} from "@/lib/search.suggestions";
import { useCacheStore } from "@/store/cache.store";
import { useCategoryStore } from "@/store/category.store";
import { useTorrentStore } from "@/store/download.store";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type {
  FolderNode,
  VideoFileEntry,
  FFMPEGStatus,
  ScanType,
  FileSearchResult,
} from "@/types";

import CategoryView from "./components/player/category.player";
import {
  DraggableFolder,
  DraggableTorrent,
  DragOverlayItem,
} from "./components/player/draggable.player";
import FFMPEG from "./components/player/ffmpeg.player";
import QueuePanel from "./components/player/queue.player";
import FolderScanProgress from "./components/player/scan.player";
import PlayerVisibilityModal from "./components/player/visibility.player";

type CategoryDragData =
  | { type: "folder"; name: string; folderPath: string }
  | {
      type: "torrent";
      name: string;
      infoHash: string;
      torrentId: number;
      saveDir: string;
      totalBytes: number;
    };

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
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const videoExtensions = useSettingsStore((s) => s.videoExtensions);
  const savedFolderPaths = useSettingsStore((s) => s.savedFolderPaths);
  const hiddenPlayerFolders = useSettingsStore((s) => s.hiddenPlayerFolders);
  const hiddenPlayerTorrents = useSettingsStore((s) => s.hiddenPlayerTorrents);
  const hidePlayerFolder = useSettingsStore((s) => s.hidePlayerFolder);
  const unhidePlayerFolder = useSettingsStore((s) => s.unhidePlayerFolder);
  const hidePlayerTorrent = useSettingsStore((s) => s.hidePlayerTorrent);
  const unhidePlayerTorrent = useSettingsStore((s) => s.unhidePlayerTorrent);
  const patch = useSettingsStore((s) => s.patch);
  const searchHistory = useSearchStore((state) => state.history);
  const queryStats = useSearchStore((state) => state.queryStats);
  const suggestionStats = useSearchStore((state) => state.suggestionStats);
  const animeProfileId = useSearchStore((state) => state.animeProfileId);
  const recordSuggestion = useSearchStore((state) => state.recordSuggestion);
  const recordSuggestionIgnored = useSearchStore(
    (state) => state.recordSuggestionIgnored
  );
  const [torrentLoading, setTorrentLoading] = useState<Set<number>>(new Set());
  const fetchingRef = useRef<Set<number>>(new Set());
  const scannedPathsRef = useRef<string[] | null>(null);

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<
    string | null
  >(null);
  const [activeDrag, setActiveDrag] = useState<{ name: string } | null>(null);
  const [showHiddenItems, setShowHiddenItems] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
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
    invoke<FileSearchResult[]>("search_file_index", {
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

  const deferredSearch = useDeferredValue(search);
  const backendSuggestions = useUnifiedIndexSuggestions(
    deferredSearch,
    "player",
    8
  );
  const suggestions = useMemo(
    () =>
      getSearchSuggestions(deferredSearch, {
        animeEnabled: animeProfileId !== null,
        backendSuggestions,
        extraValues: searchResults.map((result) => ({
          kind: "local" as const,
          value: result.name,
        })),
        history: searchHistory,
        queryStats,
        scope: "player",
        suggestionStats,
        limit: 8,
      }),
    [
      animeProfileId,
      backendSuggestions,
      queryStats,
      deferredSearch,
      searchHistory,
      searchResults,
      suggestionStats,
    ]
  );
  const inlineCompletion = useMemo(
    () => getInlineCompletion(deferredSearch, suggestions),
    [deferredSearch, suggestions]
  );

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
        (t) =>
          !categorizedHashes.has(t.info_hash) &&
          !hiddenPlayerTorrents.includes(t.info_hash)
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
      name:
        names.get(path) ?? path.split(/[\\/]/).filter(Boolean).pop() ?? path,
    }));
  }, [folderTrees, hiddenPlayerFolders]);

  const hiddenTorrentItems = useMemo(
    () =>
      hiddenPlayerTorrents.map((infoHash) => ({
        infoHash,
        name:
          torrents.find((torrent) => torrent.info_hash === infoHash)?.name ??
          infoHash,
      })),
    [hiddenPlayerTorrents, torrents]
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
              if (success) {
                fetchingRef.current.delete(t.id);
              } else {
                setTimeout(() => {
                  fetchingRef.current.delete(t.id);
                }, 3000);
              }
            })
            .catch(() => {
              fetchingRef.current.delete(t.id);
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
    [videoExtensions]
  );

  const persistMediaRecords = useCallback(
    async (entries: VideoFileEntry[], scopes: string[]) => {
      if (scopes.length === 0) return;
      const records = entries.map((entry) => {
        const parsed = parseVaultFilename(entry.name);
        return {
          path: entry.path,
          name: entry.name,
          size: entry.size,
          title: parsed.title,
          season: parsed.season,
          episode: parsed.episode,
          quality: parsed.quality,
          codec: parsed.codec,
          subtitleLikely: /(?:\bsub(?:s|title)?\b|\beng\b|\bru\b)/iu.test(
            entry.name
          ),
        };
      });
      await invoke("save_vault_media_records", { records, scopes }).catch(
        () => {}
      );
    },
    []
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
      const indexedEntries: VideoFileEntry[] = [];
      const scannedScopes: string[] = [];
      for (let i = 0; i < savedFolderPaths.length; i++) {
        if (cancelled) return;
        const path = savedFolderPaths[i];
        setScanProgress({ current: i, total: savedFolderPaths.length });
        try {
          const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
            path,
            extensions: videoExtensions,
          });
          if (!cancelled) {
            scannedScopes.push(path);
            indexedEntries.push(...(entries ?? []));
            if (entries?.length) trees.push(buildTree(entries, path));
          }
        } catch {
          // A removed or inaccessible folder should not prevent other folders
          // from appearing.
        }
      }
      if (cancelled) return;
      setFolderTrees(trees);
      setScanProgress(null);
      scannedPathsRef.current = [...savedFolderPaths];
      await rebuildIndex(savedFolderPaths);
      await persistMediaRecords(indexedEntries, scannedScopes);
      if (cancelled) return;
      useCacheStore
        .getState()
        .setFolderTrees(trees.map((t) => ({ path: t.path, tree: t })));
    })();

    return () => {
      cancelled = true;
    };
  }, [savedFolderPaths, videoExtensions, persistMediaRecords, rebuildIndex]);

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
    let disposed = false;
    listen<string[]>("folder-content-changed", (event) => {
      const changed = event.payload;
      queryClient.invalidateQueries({ queryKey: ["extra_files"] });
      (async () => {
        for (const path of changed) {
          try {
            const entries = await invoke<VideoFileEntry[]>(
              "scan_video_folder",
              { path, extensions: videoExtensions }
            );
            if (!disposed) {
              await invoke("refresh_file_index", {
                paths: [path],
                extensions: videoExtensions,
              });
              await persistMediaRecords(entries ?? [], [path]);
              setFolderTrees((prev) => {
                const next = prev.filter((tree) => tree.path !== path);
                if (entries?.length) next.push(buildTree(entries, path));
                useCacheStore
                  .getState()
                  .setFolderTrees(
                    next.map((tree) => ({ path: tree.path, tree }))
                  );
                return next;
              });
            }
          } catch {
            // The watched path may have been removed between the event and scan.
          }
        }
      })();
    })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // The window may close before Tauri finishes listener registration.
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [persistMediaRecords, videoExtensions]);

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
      persistMediaRecords(entries, [folder]);
      useCacheStore
        .getState()
        .setFolderTrees(next.map((t) => ({ path: t.path, tree: t })));
    } catch {
    } finally {
      const unlisten = await unlistenPromise.catch(() => {});
      unlisten?.();
      setLoading(false);
      setScanProgress(null);
    }
  }, [folderTrees, videoExtensions, patch, persistMediaRecords, rebuildIndex]);

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
    addCategory(t("player.route.newCategory"));
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
        const data = event.active.data.current as
          | Partial<CategoryDragData>
          | undefined;
        setActiveDrag(data?.name ? { name: data.name } : null);
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <main className="flex h-full w-full flex-col gap-1 overflow-y-auto">
        <section className="ui-toolbar ui-panel w-full">
          <Button onClick={handleOpenFolder}>
            <ImageComponent
              src="/images/w2k_folder_closed.ico"
              alt=""
              className="size-4"
            />
            {t("player.route.addFolder")}
          </Button>{" "}
          <Button onClick={handleCreateCategory}>
            <ImageComponent
              src="/images/w2k_folder_closed.ico"
              alt=""
              className="size-4"
            />
            {t("player.route.createCategory")}
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
          <span className="text-muted ml-auto text-[10px]">v9.0</span>
        </section>

        {!loading && folderTrees.length > 0 && (
          <section className="ui-panel p-1">
            <div className="flex items-center gap-1">
              <Search className="text-muted size-4" />
              <InlineAutocompleteInput
                className="font-bold"
                placeholder={t("player.route.searchFolders")}
                value={search}
                completion={inlineCompletion}
                suggestions={suggestions}
                history={searchHistory}
                onChange={(e) => setSearch(e.target.value)}
                onAcceptCompletion={(value) => {
                  recordSuggestion(value);
                  setSearch(value);
                }}
                onDismissCompletion={() => {
                  if (inlineCompletion)
                    recordSuggestionIgnored(inlineCompletion);
                }}
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

        <QueuePanel />

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
                  audioExtensions={audioExtensions}
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
                audioExtensions={audioExtensions}
              />
            ))}
          </section>
        )}

        {!loading &&
          displayTrees.length === 0 &&
          filteredTorrents.length === 0 &&
          categories.length === 0 && (
            <section className="ui-empty-state flex-col">
              <FolderOpen className="size-8" />
              <span className="windows95-text">
                {t("player.route.libraryEmpty")}
              </span>
              <span className="windows95-text text-[10px]">
                {t("player.route.addFolderHint")}
              </span>
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

        {pendingDeleteCategory && (
          <ConfirmDialog
            open
            title={t("player.route.deleteCategoryTitle")}
            message={t("player.route.deleteCategoryMessage")}
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
      </main>

      <DragOverlay>
        {activeDrag ? <DragOverlayItem name={activeDrag.name} /> : null}
      </DragOverlay>

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
