import { useTorrentStore } from "@/store/download.store";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FileVideo,
  Play,
  X,
  Download,
  Search,
  Keyboard,
  ListVideo,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button.component";
import TorrentFilesSection from "./components/file.torrent";
import Player from "@/components/shared/player.component";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { VideoStreamInfo } from "@/types";
import { getPosition } from "@/lib/storage";

interface VideoFileEntry {
  readonly path: string;
  readonly name: string;
  readonly size: number;
}

interface FolderNode {
  name: string;
  path: string;
  files: VideoFileEntry[];
  children: FolderNode[];
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function countFiles(node: FolderNode): number {
  let n = node.files.length;
  for (const c of node.children) n += countFiles(c);
  return n;
}

function FolderNodeView({
  node,
  depth,
  onPlay,
  searchQuery,
}: {
  node: FolderNode;
  depth: number;
  onPlay: (path: string) => void;
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0 || node.files.length > 0;

  const filteredFiles = searchQuery
    ? node.files.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : node.files;

  const hasFilteredChildren = searchQuery
    ? node.children.some((c) => nodeMatchesSearch(c, searchQuery))
    : node.children.length > 0;

  if (!hasChildren) return null;
  if (searchQuery && filteredFiles.length === 0 && !hasFilteredChildren)
    return null;

  const isExpanded = expanded;

  return (
    <div>
      <button
        className="flex items-center gap-1 text-[10px] windows95-font cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
        onClick={() => setExpanded(!expanded)}
        style={{ paddingLeft: `${depth * 12 + 2}px` }}
      >
        {isExpanded ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <FolderOpen className="size-3 shrink-0 text-yellow-400" />
        <span className="truncate">{node.name}</span>
        {!searchQuery && (
          <span className="text-white/40 ml-auto whitespace-nowrap">
            {countFiles(node)}
          </span>
        )}
      </button>
      {isExpanded && (
        <div>
          {filteredFiles.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-1 px-1 py-0.5 hover:bg-surface group"
              style={{ paddingLeft: `${(depth + 1) * 12 + 2}px` }}
            >
              <FileVideo className="size-3 shrink-0 text-white/60" />
              <span
                className="text-[10px] windows95-font truncate flex-1"
                title={f.name}
              >
                {f.name}
              </span>
              <span className="text-[10px] windows95-font text-white/40 mr-1">
                {formatSize(f.size)}
              </span>
              <button
                className="size-4 flex items-center justify-center bg-primary windows95-border hover:bg-secondary cursor-pointer"
                onClick={() => onPlay(f.path)}
                title="Play"
              >
                <Play className="size-2.5" />
              </button>
            </div>
          ))}
          {node.children.map((child) => (
            <FolderNodeView
              key={child.name}
              node={child}
              depth={depth + 1}
              onPlay={onPlay}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function nodeMatchesSearch(node: FolderNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.name.toLowerCase().includes(q)) return true;
  if (node.files.some((f) => f.name.toLowerCase().includes(q))) return true;
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

function buildTree(entries: VideoFileEntry[], rootPath: string): FolderNode {
  const root: FolderNode = {
    name: rootPath.split(/[/\\]/).pop() ?? "Folder",
    path: rootPath,
    files: [],
    children: [],
  };

  for (const f of entries) {
    const rel = f.path
      .replace(f.name, "")
      .replace(rootPath, "")
      .replace(/^[/\\]+/, "")
      .replace(/[/\\]$/, "");
    const parts = rel ? rel.split(/[/\\]/) : [];
    let node = root;
    for (const part of parts) {
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: "", files: [], children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.files.push(f);
  }

  const sortNode = (n: FolderNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.files.sort((a, b) => a.name.localeCompare(b.name));
    for (const c of n.children) sortNode(c);
  };
  sortNode(root);
  return root;
}

function PlayerRoute({
  cinemaMode,
  autoHideUi,
  onToggleCinema,
  onToggleAutoHide,
}: {
  cinemaMode?: boolean;
  autoHideUi?: boolean;
  onToggleCinema?: () => void;
  onToggleAutoHide?: () => void;
}) {
  const { torrents, torrentFilesMap, loadTorrentFiles } = useTorrentStore(
    (state) => state,
  );

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [video, setVideo] = useState<{
    path: string;
    file: string;
    initialTime?: number;
  } | null>(null);

  const [chapters, setChapters] = useState<
    { start_time: number; end_time: number; title: string }[]
  >([]);

  const [streams, setStreams] = useState<VideoStreamInfo[]>([]);

  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([]);

  const [ffmpegStatus, setFfmpegStatus] = useState<
    "checking" | "ok" | "missing" | "downloading"
  >("checking");

  const [folderSearch, setFolderSearch] = useState("");
  const [showCheatsheet, setShowCheatsheet] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Build flat file list from all folder trees for prev/next
  function getAllFiles(): VideoFileEntry[] {
    const result: VideoFileEntry[] = [];
    for (const t of folderTrees) {
      const stack = [t];
      while (stack.length > 0) {
        const n = stack.pop()!;
        result.push(...n.files);
        stack.push(...n.children);
      }
    }
    return result;
  }
  const allFiles = getAllFiles();
  const currentFileIndex = video
    ? allFiles.findIndex((f) => f.path === video.path)
    : -1;

  const hasNext =
    currentFileIndex >= 0 && currentFileIndex < allFiles.length - 1;
  const hasPrev = currentFileIndex > 0;

  const playFile = useCallback((filePath: string) => {
    const saved = getPosition(filePath);
    setVideo({
      path: filePath,
      file: filePath.split(/[/\\]/).pop() ?? "Video",
      initialTime: saved,
    });
    setShowPlaylist(false);
  }, []);

  const handleFileNext = useCallback(() => {
    if (hasNext && allFiles[currentFileIndex + 1]) {
      playFile(allFiles[currentFileIndex + 1].path);
    }
  }, [hasNext, allFiles, currentFileIndex, playFile]);

  const handleFilePrev = useCallback(() => {
    if (hasPrev && allFiles[currentFileIndex - 1]) {
      playFile(allFiles[currentFileIndex - 1].path);
    }
  }, [hasPrev, allFiles, currentFileIndex, playFile]);

  useEffect(() => {
    invoke<boolean>("check_ffprobe")
      .then((ok) => setFfmpegStatus(ok ? "ok" : "missing"))
      .catch(() => setFfmpegStatus("missing"));
  }, []);

  const handleDownloadFfmpeg = useCallback(async () => {
    setFfmpegStatus("downloading");
    try {
      await invoke<string>("download_ffmpeg");
      setFfmpegStatus("ok");
      if (video) {
        invoke<{
          chapters: { start_time: number; end_time: number; title: string }[];
          streams: VideoStreamInfo[];
        }>("get_video_info", { path: video.path })
          .then((info) => {
            setChapters(info.chapters);
            setStreams(info.streams);
          })
          .catch(() => {});
      }
    } catch {
      setFfmpegStatus("missing");
    }
  }, [video]);

  // restore folders from last session
  useEffect(() => {
    const saved = localStorage.getItem("folderPaths");
    if (!saved) return;
    setLoadingFolders(true);
    const paths = JSON.parse(saved) as string[];
    Promise.all(
      paths.map((p) =>
        invoke<VideoFileEntry[]>("scan_video_folder", { path: p })
          .then((entries) =>
            entries.length > 0 ? buildTree(entries, p) : null,
          )
          .catch(() => null),
      ),
    ).then((trees) => {
      setFolderTrees(trees.filter(Boolean) as FolderNode[]);
      setLoadingFolders(false);
    });
  }, []);

  useEffect(() => {
    if (!video) {
      setChapters([]);
      setStreams([]);
      return;
    }

    invoke<{
      chapters: { start_time: number; end_time: number; title: string }[];
      streams: VideoStreamInfo[];
    }>("get_video_info", { path: video.path })
      .then((info) => {
        setChapters(info.chapters);
        setStreams(info.streams);
        return invoke<VideoStreamInfo[]>("scan_external_tracks", {
          path: video.path,
        });
      })
      .then((matches) => {
        setStreams((prev) => [...prev, ...matches]);
      })
      .catch(() => {
        setChapters([]);
        setStreams([]);
      });
  }, [video]);

  useEffect(() => {
    torrents.forEach((t) => {
      if (!torrentFilesMap[t.id]) {
        loadTorrentFiles(t.id);
      }
    });
  }, [torrents, torrentFilesMap, loadTorrentFiles]);

  // Keyboard cheatsheet toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Slash" && e.shiftKey) {
        e.preventDefault();
        setShowCheatsheet((p) => !p);
      }
      if (e.code === "Escape") {
        setShowCheatsheet(false);
        setShowPlaylist(false);
      }
      if (e.code === "KeyP" && e.ctrlKey) {
        e.preventDefault();
        setShowPlaylist((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persistFolders = useCallback((trees: FolderNode[]) => {
    localStorage.setItem(
      "folderPaths",
      JSON.stringify(trees.map((t) => t.path)),
    );
  }, []);

  const handleOpenFile = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Video",
            extensions: [
              "mp4",
              "mkv",
              "avi",
              "mov",
              "webm",
              "flv",
              "wmv",
              "m4v",
              "mpg",
              "mpeg",
              "ts",
              "m2ts",
              "ogv",
              "3gp",
            ],
          },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (file) playFile(file);
    } catch {}
  };

  const handleOpenFolder = async () => {
    try {
      const folder = await open({
        multiple: false,
        directory: true,
      });
      if (!folder) return;
      if (folderTrees.some((t) => t.path === folder)) return;
      setLoadingFolders(true);
      const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
        path: folder,
      });
      setLoadingFolders(false);
      if (entries.length === 0) return;
      const tree = buildTree(entries, folder);
      const next = [...folderTrees, tree];
      setFolderTrees(next);
      persistFolders(next);
    } catch {
      setLoadingFolders(false);
    }
  };

  const removeFolder = useCallback(
    (path: string) => {
      setFolderTrees((prev) => {
        const next = prev.filter((t) => t.path !== path);
        persistFolders(next);
        return next;
      });
    },
    [persistFolders],
  );

  return (
    <main className="flex flex-col gap-1 h-full w-full overflow-y-auto">
      {video ? (
        <Player
          header={video.file}
          src={convertFileSrc(video.path)}
          onClose={() => setVideo(null)}
          chapters={chapters}
          mediaPath={video.path}
          streams={streams}
          initialTime={video.initialTime}
          onFileNext={handleFileNext}
          onFilePrev={handleFilePrev}
          hasNext={hasNext}
          hasPrev={hasPrev}
          cinemaMode={cinemaMode}
          autoHideUi={autoHideUi}
          onToggleCinema={onToggleCinema}
          onToggleAutoHide={onToggleAutoHide}
        />
      ) : (
        <>
          <section className="windows95-active-border bg-primary p-1 flex gap-1">
            <button
              className="flex items-center gap-1 text-[11px] windows95-font cursor-pointer hover:bg-surface px-1 py-0.5"
              onClick={handleOpenFile}
            >
              <FolderOpen className="size-4" />
              Открыть файл
            </button>
            <button
              className="flex items-center gap-1 text-[11px] windows95-font cursor-pointer hover:bg-surface px-1 py-0.5"
              onClick={handleOpenFolder}
            >
              <FolderOpen className="size-4" />
              Открыть папку
            </button>
            <div className="ml-auto flex gap-1">
              <button
                className="flex items-center gap-1 text-[11px] windows95-font cursor-pointer hover:bg-surface px-1 py-0.5"
                onClick={() => setShowCheatsheet((p) => !p)}
                title="Shortcuts (?)"
              >
                <Keyboard className="size-4" />
              </button>
            </div>
          </section>

          {ffmpegStatus === "downloading" && (
            <section className="windows95-active-border bg-primary px-1 py-0.5 flex items-center gap-1">
              <span className="text-[10px] windows95-font">
                Загрузка FFmpeg...
              </span>
            </section>
          )}
          {ffmpegStatus === "missing" && (
            <section className="windows95-active-border bg-primary px-1 py-0.5 flex items-center gap-1">
              <span className="text-destructive text-[10px] windows95-font flex-1">
                FFmpeg не найден
              </span>
              <button
                className="flex items-center gap-1 bg-primary windows95-border px-1 py-0.5 text-[10px] windows95-font cursor-pointer hover:bg-secondary"
                onClick={handleDownloadFfmpeg}
              >
                <Download className="size-3" />
                Скачать (~50MB)
              </button>
            </section>
          )}

          {showCheatsheet && (
            <section className="windows95-active-border bg-primary p-2 relative">
              <button
                className="absolute top-1 right-1 size-4 flex items-center justify-center bg-primary windows95-border cursor-pointer hover:bg-secondary"
                onClick={() => setShowCheatsheet(false)}
              >
                <X className="size-3" />
              </button>
              <span className="text-[11px] windows95-font font-bold block mb-1">
                Горячие клавиши
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] windows95-font">
                <span>Space</span>
                <span>Play / Пауза</span>
                <span>← / →</span>
                <span>Назад / Вперёд 5с</span>
                <span>↑ / ↓</span>
                <span>Громкость</span>
                <span>, / .</span>
                <span>Кадр назад / вперёд</span>
                <span>F1 / F2</span>
                <span>Субтитры -500/+500ms</span>
                <span>Ctrl+F1/F2</span>
                <span>Субтитры -50/+50ms</span>
                <span>PageUp / PageDown</span>
                <span>Пред. / След. файл</span>
                <span>Ctrl+H</span>
                <span>Авто-скрытие</span>
                <span>Ctrl+P</span>
                <span>Плейлист</span>
                <span>?</span>
                <span>Это окно</span>
              </div>
            </section>
          )}

          <div className="flex flex-col md:flex-row gap-1">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[11px] font-bold windows95-font">
                Папки
              </span>

              {loadingFolders && (
                <section className="windows95-active-border bg-primary px-1 py-0.5 flex items-center gap-1">
                  <span className="size-3 border-2 border-t-secondary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                  <span className="text-[10px] windows95-font">
                    Загрузка папок...
                  </span>
                </section>
              )}

              {/* Folder search */}
              {folderTrees.length > 0 && (
                <section className="windows95-active-border bg-primary p-1">
                  <div className="flex items-center gap-1">
                    <Search className="size-3 shrink-0 text-white/60" />
                    <input
                      className="flex-1 h-5 text-[10px] windows95-font bg-white windows95-border px-1 outline-none"
                      placeholder="Поиск в папках..."
                      value={folderSearch}
                      onChange={(e) => setFolderSearch(e.target.value)}
                    />
                    {folderSearch && (
                      <button
                        className="size-4 flex items-center justify-center bg-primary windows95-border cursor-pointer hover:bg-secondary"
                        onClick={() => setFolderSearch("")}
                      >
                        <X className="size-2.5" />
                      </button>
                    )}
                  </div>
                </section>
              )}

              {folderTrees.map((tree) => (
                <div
                  key={tree.path}
                  className="flex flex-col windows95-active-border bg-primary gap-1"
                >
                  <section className="bg-secondary pb-1 px-1 flex items-center gap-1">
                    <FolderOpen className="size-3 shrink-0 text-yellow-400" />
                    <span className="text-white text-[11px] font-bold windows95-font truncate flex-1">
                      {tree.name}
                    </span>
                    <span className="text-white/60 text-[10px] windows95-font whitespace-nowrap">
                      {countFiles(tree)}
                    </span>
                    <Button
                      size="icon"
                      className="size-4"
                      onClick={() => removeFolder(tree.path)}
                    >
                      <X className="size-3" />
                    </Button>
                  </section>
                  <section className="p-1">
                    <FolderNodeView
                      node={tree}
                      depth={0}
                      onPlay={playFile}
                      searchQuery={folderSearch}
                    />
                  </section>
                </div>
              ))}
            </div>

            {/* Playlist panel */}
            {showPlaylist && allFiles.length > 0 && (
              <div className="w-48 shrink-0 windows95-active-border bg-primary flex flex-col h-fit max-h-64">
                <section className="bg-secondary pb-1 px-1 flex items-center gap-1">
                  <ListVideo className="size-3 shrink-0" />
                  <span className="text-white text-[11px] font-bold windows95-font truncate flex-1">
                    Плейлист
                  </span>
                  <Button
                    size="icon"
                    className="size-4"
                    onClick={() => setShowPlaylist(false)}
                  >
                    <X className="size-3" />
                  </Button>
                </section>
                <section className="p-1 overflow-y-auto">
                  {allFiles.map((f, idx) => (
                    <div
                      key={f.path}
                      className={
                        "flex items-center gap-1 px-0.5 py-0.5 cursor-pointer hover:bg-surface text-[10px] windows95-font" +
                        (idx === currentFileIndex
                          ? " bg-secondary text-white"
                          : "")
                      }
                      onClick={() => playFile(f.path)}
                    >
                      <FileVideo className="size-3 shrink-0 text-white/60" />
                      <span className="truncate flex-1">{f.name}</span>
                    </div>
                  ))}
                </section>
              </div>
            )}
          </div>

          {torrents.map((item, index) => {
            const isExpanded = expanded.has(item.id);
            const files = torrentFilesMap[item.id];

            return (
              <div
                key={index}
                className="flex flex-col windows95-active-border bg-primary gap-2"
              >
                <section className="bg-secondary pb-1 px-1 line-clamp-1">
                  <span className="text-white text-[11px] font-bold windows95-font">
                    {item.name}
                  </span>
                </section>

                {files && (
                  <section className="p-1 gap-1 flex flex-col">
                    <button
                      className="flex items-center gap-1 text-[10px] windows95-font cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
                      onClick={() => toggleExpanded(item.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronRight className="size-3" />
                      )}
                      Файлы ({files.filter((f) => f.completed).length})
                    </button>
                    {isExpanded && (
                      <TorrentFilesSection
                        id={item.id}
                        files={files}
                        type="player"
                        path={item.save_dir}
                        onPlay={playFile}
                      />
                    )}
                  </section>
                )}
                {item.error && (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-[10px] text-destructive windows95-font">
                      {item.error}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </main>
  );
}

export default PlayerRoute;
