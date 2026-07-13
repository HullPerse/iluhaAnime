import { Input } from "@/components/ui/input.component";
import { Button } from "@/components/ui/button.component";
import {
  FolderOpen,
  File,
  X,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import FFMPEG from "./components/player/ffmpeg.player";
import FolderView from "./components/player/folder.player";
import { useTorrentStore } from "@/store/download.store";
import TorrentFilesSection from "./components/torrent/file.torrent";
import { useSettingsStore } from "@/store/settings.store";
import { openPath } from "@tauri-apps/plugin-opener";
import QueuePanel from "./components/player/queue.player";
import type { FolderNode } from "@/types/index";

type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";
type ScanType = { current: number; total: number } | null;

interface VideoFileEntry {
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

function PlayerRoute() {
  const torrents = useTorrentStore((state) => state.torrents);
  const torrentFilesMap = useTorrentStore((state) => state.torrentFilesMap);
  const loadTorrentFiles = useTorrentStore((state) => state.loadTorrentFiles);

  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<ScanType>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<FFMPEGStatus>("checking");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const videoExtensions = useSettingsStore((s) => s.videoExtensions);
  const savedFolderPaths = useSettingsStore((s) => s.savedFolderPaths);
  const patch = useSettingsStore((s) => s.patch);
  const [upscaledFiles, setUpscaledFiles] = useState<Map<number, { name: string; size: number; fullPath: string }[]>>(new Map());

  useEffect(() => {
    invoke<boolean>("check_ffprobe")
      .then((ok) => setFfmpegStatus(ok ? "ok" : "missing"))
      .catch(() => setFfmpegStatus("missing"));
  }, []);

  useEffect(() => {
    torrents.forEach((t) => {
      if (!torrentFilesMap[t.id]) {
        loadTorrentFiles(t.id);
      }
    });
  }, [torrents, torrentFilesMap, loadTorrentFiles]);

  // Restore cached folder trees on mount for instant display
  useEffect(() => {
    try {
      const cached = localStorage.getItem("folderTreeCache");
      if (cached) {
        const parsed = JSON.parse(cached) as { path: string; tree: FolderNode }[];
        if (parsed.length > 0) {
          setFolderTrees(parsed.map((c) => c.tree));
        }
      }
    } catch {}
  }, []);

  // Full background scan on mount
  useEffect(() => {
    const paths = useSettingsStore.getState().savedFolderPaths;
    if (paths.length === 0) return;

    setScanProgress({ current: 0, total: 0 });

    (async () => {
      const trees: FolderNode[] = [];

      for (let i = 0; i < paths.length; i++) {
        setScanProgress({ current: i, total: paths.length });

        try {
          const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
            path: paths[i],
            extensions: videoExtensions,
          });
          if (entries?.length) trees.push(buildTree(entries, paths[i]));
        } catch { }
      }

      setFolderTrees(trees);
      setScanProgress(null);

      // Cache trees for instant startup next time
      try {
        const cache = trees.map((t) => ({ path: t.path, tree: t }));
        localStorage.setItem("folderTreeCache", JSON.stringify(cache));
      } catch {}
    })();
  }, []);

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
            const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
              path: p,
              extensions: ext,
            });
            if (entries?.length) {
              setFolderTrees((prev) => {
                const next = prev.filter((t) => t.path !== p);
                next.push(buildTree(entries, p));
                // Update cache
                try {
                  const cache = next.map((t) => ({ path: t.path, tree: t }));
                  localStorage.setItem("folderTreeCache", JSON.stringify(cache));
                } catch {}
                return next;
              });
            }
          } catch { }
        }
      })();
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
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
      } catch { }
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    const folder = await open({
      multiple: false,
      directory: true,
    });

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
      setScanProgress({
        current: e.payload.current,
        total: e.payload.total,
      });
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
  }, [folderTrees, videoExtensions, patch]);

  const handleRemoveFolder = useCallback(
    (path: string) => {
      setFolderTrees((prev) => {
        const next = prev.filter((t) => t.path !== path);
        patch({ savedFolderPaths: next.map((t) => t.path) });
        try {
          const cache = next.map((t) => ({ path: t.path, tree: t }));
          localStorage.setItem("folderTreeCache", JSON.stringify(cache));
        } catch {}
        return next;
      });
    },
    [patch],
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
      {/* FILE CONTROLS */}
      <section className="flex flex-row w-full h-8 windows95-active-border bg-primary gap-1 p-1 items-center">
        <Button onClick={handleOpenFile}>
          <File /> Открыть файл
        </Button>
        <Button onClick={handleOpenFolder}>
          <FolderOpen />
          Открыть папку
        </Button>
      </section>

      {/* FFMPEG STATUS */}
      <section className="flex flex-row w-full h-8 windows95-active-border bg-primary gap-1 p-1 items-center">
        <FFMPEG status={ffmpegStatus} setStatus={setFfmpegStatus} />
        <span className="ml-auto text-[10px] text-muted">v8.1</span>
      </section>

      {/* SAVED FOLDERS */}
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

      {/*LOADING*/}
      {loading && scanProgress && (
        <section className="flex flex-col windows95-active-border w-full items-stretch windows95-text gap-1 px-1 py-1">
          <span>
            {scanProgress.total === 0
              ? "Подсчёт файлов..."
              : `Сканирование... ${scanProgress.current} / ${scanProgress.total}`}
          </span>
          {scanProgress.total > 0 && (
            <div className="flex flex-row items-center gap-1">
              <div className="flex-1 h-4 windows95-border bg-white">
                <div
                  className="h-full bg-secondary"
                  style={{
                    width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                    transition: "none",
                  }}
                />
              </div>
              <span className="text-[10px] shrink-0">
                {Math.round((scanProgress.current / scanProgress.total) * 100)}%
              </span>
            </div>
          )}
        </section>
      )}

      {!loading && folderTrees.length > 0 && (
        <section className="flex flex-col w-full windows95-text gap-2">
          {folderTrees.map((tree) => (
            <div key={tree.path} className="flex flex-col windows95-active-border bg-primary">
              <FolderView
                node={tree}
                depth={0}
                searchQuery={search}
                onRemove={handleRemoveFolder}
                disabledExtensions={new Set(audioExtensions)}
              />
            </div>
          ))}
        </section>
      )}

      {/* UPSCALE QUEUE */}
      <QueuePanel />

      {/* TORRENTS */}
      {!loading && torrents.map((item, index) => {
        const isExpanded = expanded.has(item.id);
        const files = torrentFilesMap[item.id];

        return (
          <section
            key={index}
            className="flex flex-col windows95-active-border bg-primary gap-1"
          >
            <div className="flex items-center gap-1 bg-secondary text-white px-1">
              <span className="flex-1 line-clamp-1 font-bold windows95-text py-0.5">
                {item.name}
              </span>
            </div>

            {files && (
              <section className="flex flex-col gap-1">
                <div
                  role="button"
                  className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
                  onClick={() => toggleExpanded(item.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                  Файлы ({files.filter((f) => f.completed).length})
                  {files.some((f) => !f.exists) && (
                    <span className="text-destructive ml-1">
                      · {files.filter((f) => !f.exists).length} отсутствуют
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <TorrentFilesSection
                    id={item.id}
                    files={files.filter((f) => f.completed)}
                    type="player"
                    path={item.save_dir}
                    extraFiles={upscaledFiles.get(item.id)}
                    onUpscaleDone={(filePath) => {
                      setUpscaledFiles((prev) => {
                        const next = new Map(prev);
                        const existing = next.get(item.id) || [];
                        if (existing.some((e) => e.fullPath === filePath)) return prev;
                        const name = filePath.replace(/\\/g, "/").split("/").pop() || filePath;
                        next.set(item.id, [...existing, { name, size: 0, fullPath: filePath }]);
                        return next;
                      });
                    }}
                  />
                )}
              </section>
            )}

            {item.error && (
              <span className="flex w-full items-center gap-1 text-destructive windows95-text">
                {item.error}
              </span>
            )}
          </section>
        );
      })}
    </main>
  );
}

export default PlayerRoute;
