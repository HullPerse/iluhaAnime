import { useTorrentStore } from "@/store/download.store";
import { ChevronDown, ChevronRight, FolderOpen, FileVideo, Play, X, Download } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button.component";
import TorrentFilesSection from "./components/file.torrent";
import Player from "@/components/shared/player.component";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { VideoStreamInfo } from "@/types";

interface VideoFileEntry {
  path: string;
  name: string;
  size: number;
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
}: {
  node: FolderNode;
  depth: number;
  onPlay: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0 || node.files.length > 0;

  if (!hasChildren) return null;

  return (
    <div>
      <button
        className="flex items-center gap-1 text-[10px] windows95-font cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
        onClick={() => setExpanded(!expanded)}
        style={{ paddingLeft: `${depth * 12 + 2}px` }}
      >
        {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <FolderOpen className="size-3 shrink-0 text-yellow-400" />
        <span className="truncate">{node.name}</span>
        <span className="text-white/40 ml-auto whitespace-nowrap">{countFiles(node)}</span>
      </button>
      {expanded && (
        <div>
          {node.files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-1 px-1 py-0.5 hover:bg-surface group"
              style={{ paddingLeft: `${(depth + 1) * 12 + 2}px` }}
            >
              <FileVideo className="size-3 shrink-0 text-white/60" />
              <span className="text-[10px] windows95-font truncate flex-1" title={f.name}>{f.name}</span>
              <span className="text-[10px] windows95-font text-white/40 mr-1">{formatSize(f.size)}</span>
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
            <FolderNodeView key={child.name} node={child} depth={depth + 1} onPlay={onPlay} />
          ))}
        </div>
      )}
    </div>
  );
}

function buildTree(entries: VideoFileEntry[], rootPath: string): FolderNode {
  const root: FolderNode = { name: rootPath.split(/[/\\]/).pop() ?? "Folder", path: rootPath, files: [], children: [] };

  for (const f of entries) {
    const rel = f.path.replace(f.name, "").replace(rootPath, "").replace(/^[/\\]+/, "").replace(/[/\\]$/, "");
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

function PlayerRoute() {
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

  const [ffmpegStatus, setFfmpegStatus] = useState<"checking" | "ok" | "missing" | "downloading">("checking");

  useEffect(() => {
    invoke<boolean>("check_ffprobe").then((ok) => setFfmpegStatus(ok ? "ok" : "missing")).catch(() => setFfmpegStatus("missing"));
  }, []);

  const handleDownloadFfmpeg = useCallback(async () => {
    setFfmpegStatus("downloading");
    try {
      await invoke<string>("download_ffmpeg");
      setFfmpegStatus("ok");
      // re-fetch video info if a video is loaded
      if (video) {
        invoke<{ chapters: { start_time: number; end_time: number; title: string }[]; streams: VideoStreamInfo[] }>(
          "get_video_info", { path: video.path },
        ).then((info) => { setChapters(info.chapters); setStreams(info.streams); }).catch(() => {});
      }
    } catch {
      setFfmpegStatus("missing");
    }
  }, [video]);

  // restore folders from last session
  useEffect(() => {
    const saved = localStorage.getItem("folderPaths");
    if (!saved) return;
    const paths = JSON.parse(saved) as string[];
    Promise.all(
      paths.map((p) =>
        invoke<VideoFileEntry[]>("scan_video_folder", { path: p })
          .then((entries) => (entries.length > 0 ? buildTree(entries, p) : null))
          .catch(() => null),
      ),
    ).then((trees) => setFolderTrees(trees.filter(Boolean) as FolderNode[]));
  }, []);

  useEffect(() => {
    if (!video) {
      setChapters([]);
      setStreams([]);
      return;
    }

    invoke<{ chapters: { start_time: number; end_time: number; title: string }[]; streams: VideoStreamInfo[] }>(
      "get_video_info",
      { path: video.path },
    )
      .then((info) => {
        setChapters(info.chapters);
        setStreams(info.streams);
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

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const playFile = useCallback((filePath: string) => {
    const saved = localStorage.getItem(`pos:${filePath}`);
    setVideo({
      path: filePath,
      file: filePath.split(/[/\\]/).pop() ?? "Video",
      initialTime: saved ? parseFloat(saved) : undefined,
    });
  }, []);

  const persistFolders = useCallback((trees: FolderNode[]) => {
    localStorage.setItem("folderPaths", JSON.stringify(trees.map((t) => t.path)));
  }, []);

  const handleOpenFile = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: "Video",
            extensions: [
              "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv",
              "m4v", "mpg", "mpeg", "ts", "m2ts", "ogv", "3gp",
            ],
          },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (file) playFile(file);
    } catch {
      /* dialog cancelled */
    }
  };

  const handleOpenFolder = async () => {
    try {
      const folder = await open({
        multiple: false,
        directory: true,
      });
      if (!folder) return;
      if (folderTrees.some((t) => t.path === folder)) return;
      const entries = await invoke<VideoFileEntry[]>("scan_video_folder", { path: folder });
      if (entries.length === 0) return;
      const tree = buildTree(entries, folder);
      const next = [...folderTrees, tree];
      setFolderTrees(next);
      persistFolders(next);
    } catch {
      /* scan failed */
    }
  };

  const removeFolder = useCallback((path: string) => {
    setFolderTrees((prev) => {
      const next = prev.filter((t) => t.path !== path);
      persistFolders(next);
      return next;
    });
  }, [persistFolders]);

  return (
    <main className="flex flex-col gap-1 h-full w-full overflow-y-scroll">
      {video ? (
        <Player
          header={video.file}
          src={convertFileSrc(video.path)}
          onClose={() => setVideo(null)}
          chapters={chapters}
          mediaPath={video.path}
          streams={streams}
          initialTime={video.initialTime}
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
          </section>

          {ffmpegStatus === "downloading" && (
            <section className="windows95-active-border bg-primary px-1 py-0.5 flex items-center gap-1">
              <span className="text-[10px] windows95-font">Загрузка FFmpeg...</span>
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

          {folderTrees.map((tree) => (
            <div key={tree.path} className="flex flex-col windows95-active-border bg-primary gap-1">
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
                <FolderNodeView node={tree} depth={0} onPlay={playFile} />
              </section>
            </div>
          ))}

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
                      Файлы ({files.length})
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
