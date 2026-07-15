import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import { FolderOpen, File, X, Search } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useDebounce } from "@/hooks/debounce.hook";
import FFMPEG from "./components/player/ffmpeg.player";
import FolderView from "./components/player/folder.player";
import { useTorrentStore } from "@/store/download.store";
import { useSettingsStore } from "@/store/settings.store";
import { openPath } from "@tauri-apps/plugin-opener";
import QueuePanel from "./components/player/queue.player";
import type {
  FolderNode,
  VideoFileEntry,
  FFMPEGStatus,
  ScanType,
} from "@/types";

import FolderScanProgress from "./components/player/scan.player";
import TorrentFilesPlayerSection from "./components/player/torrent.player";

interface FileSearchResult {
  path: string;
  name: string;
  size: number;
}

function buildTree(entries: VideoFileEntry[], rootPath: string): FolderNode {
  const root: FolderNode = {
    path: rootPath,
    name: rootPath.split(/[/\\]/).filter(Boolean).pop() || rootPath,
    files: [],
    children: [],
  };

  for (const entry of entries) {
    const relative = entry.path.replace(rootPath, "").replace(/^[/\\]/, "");
    const parts = relative.split(/[/\\]/);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      let child = current.children.find((c) => c.name === parts[i]);
      if (!child) {
        child = {
          path: `${current.path}/${parts[i]}`,
          name: parts[i],
          files: [],
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
    current.files.push(entry);
  }

  return root;
}

function filterTreeByPaths(
  tree: FolderNode,
  matchingPaths: Set<string>,
): FolderNode | null {
  const filteredFiles = tree.files.filter((f) => matchingPaths.has(f.path));
  const filteredChildren = tree.children
    .map((c) => filterTreeByPaths(c, matchingPaths))
    .filter((c): c is FolderNode => c !== null);

  if (filteredFiles.length === 0 && filteredChildren.length === 0) return null;

  return { ...tree, files: filteredFiles, children: filteredChildren };
}

function PlayerRoute() {
  const torrents = useTorrentStore((state) => state.torrents);
  const torrentFilesMap = useTorrentStore((state) => state.torrentFilesMap);
  const showTorrentsInPlayer = useSettingsStore(
    (state) => state.showTorrentsInPlayer,
  );

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
  const [upscaledFiles, setUpscaledFiles] = useState<
    Map<number, { name: string; size: number; fullPath: string }[]>
  >(new Map());
  const [torrentLoading, setTorrentLoading] = useState<Set<number>>(new Set());
  const fetchingRef = useRef<Set<number>>(new Set());
  const scannedPathsRef = useRef<string[] | null>(null);

  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
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

  const displayTrees = useMemo(() => {
    if (!debouncedSearch) return folderTrees;
    const matchingPaths = new Set(searchResults.map((r) => r.path));
    return folderTrees
      .map((t) => filterTreeByPaths(t, matchingPaths))
      .filter((t): t is FolderNode => t !== null);
  }, [folderTrees, searchResults, debouncedSearch]);

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
    try {
      const cached = localStorage.getItem("folderTreeCache");
      if (cached) {
        const parsed = JSON.parse(cached) as {
          path: string;
          tree: FolderNode;
        }[];
        if (parsed.length > 0) {
          setFolderTrees(parsed.map((c) => c.tree));
          rebuildIndex(parsed.map((c) => c.path));
        }
      }
    } catch {}
  }, [rebuildIndex]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("upscaledFilesCache");
      if (cached) {
        const parsed = JSON.parse(cached) as Record<
          string,
          { name: string; size: number; fullPath: string }[]
        >;
        const map = new Map<
          number,
          { name: string; size: number; fullPath: string }[]
        >();
        for (const [k, v] of Object.entries(parsed)) map.set(Number(k), v);
        setUpscaledFiles(map);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (upscaledFiles.size > 0) {
      try {
        const obj = Object.fromEntries(
          Array.from(upscaledFiles.entries()).map(([k, v]) => [String(k), v]),
        );
        localStorage.setItem("upscaledFilesCache", JSON.stringify(obj));
      } catch {}
    }
  }, [upscaledFiles]);

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
      try {
        const cache = trees.map((t) => ({ path: t.path, tree: t }));
        localStorage.setItem("folderTreeCache", JSON.stringify(cache));
      } catch {}
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
                try {
                  const cache = next.map((t) => ({ path: t.path, tree: t }));
                  localStorage.setItem(
                    "folderTreeCache",
                    JSON.stringify(cache),
                  );
                } catch {}
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

  const handleOpenFile = useCallback(async () => {
    const file = await open({
      multiple: false,
      filters: [
        {
          name: "Видео",
          extensions: [...useSettingsStore.getState().videoExtensions],
        },
        { name: "Все файлы", extensions: ["*"] },
      ],
    });
    if (file) {
      try {
        await openPath(file);
      } catch {}
    }
  }, []);

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
      try {
        const cache = next.map((t) => ({ path: t.path, tree: t }));
        localStorage.setItem("folderTreeCache", JSON.stringify(cache));
      } catch {}
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
        try {
          const cache = next.map((t) => ({ path: t.path, tree: t }));
          localStorage.setItem("folderTreeCache", JSON.stringify(cache));
        } catch {}
        return next;
      });
    },
    [patch, rebuildIndex],
  );

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="flex flex-col w-full h-full gap-1 overflow-y-auto">
      <section className="flex flex-row w-full h-8 windows95-active-border bg-primary gap-1 p-1 items-center">
        <Button onClick={handleOpenFile}>
          <File /> Открыть файл
        </Button>
        <Button onClick={handleOpenFolder}>
          <FolderOpen /> Открыть папку
        </Button>
      </section>

      <section className="flex flex-row w-full h-8 windows95-active-border bg-primary gap-1 p-1 items-center">
        <FFMPEG status={ffmpegStatus} setStatus={setFfmpegStatus} />
        <span className="ml-auto text-[10px] text-muted">v8.1</span>
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

      {search.trim() && searching && (
        <section className="flex items-center justify-center py-2">
          <span className="text-[10px] text-muted">Поиск...</span>
        </section>
      )}

      {search.trim() && !searching && displayTrees.length === 0 && (
        <section className="flex items-center justify-center py-2">
          <span className="text-[10px] text-muted">Ничего не найдено</span>
        </section>
      )}

      {!loading && displayTrees.length > 0 && (
        <section className="flex flex-col w-full windows95-text gap-2">
          {displayTrees.map((tree) => (
            <div
              key={tree.path}
              className="flex flex-col windows95-active-border bg-primary"
            >
              <FolderView
                node={tree}
                depth={0}
                searchQuery=""
                onRemove={handleRemoveFolder}
                disabledExtensions={new Set(audioExtensions)}
              />
            </div>
          ))}
        </section>
      )}

      <QueuePanel />

      {!loading &&
        showTorrentsInPlayer &&
        torrents.map((item) => (
          <TorrentFilesPlayerSection
            key={item.id}
            item={item}
            files={torrentFilesMap[item.id]}
            isExpanded={expanded.has(item.id)}
            torrentLoading={torrentLoading.has(item.id)}
            upscaledFiles={upscaledFiles.get(item.id) || []}
            onToggleExpand={() => toggleExpanded(item.id)}
            onUpscaleDone={(filePath) => {
              invoke<number>("get_file_size", { path: filePath }).then(
                (size) => {
                  setUpscaledFiles((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(item.id) || [];
                    if (existing.some((e) => e.fullPath === filePath))
                      return prev;
                    const name =
                      filePath.replace(/\\/g, "/").split("/").pop() || filePath;
                    next.set(item.id, [
                      ...existing,
                      { name, size, fullPath: filePath },
                    ]);
                    return next;
                  });
                },
              );
            }}
          />
        ))}
    </main>
  );
}

export default PlayerRoute;
