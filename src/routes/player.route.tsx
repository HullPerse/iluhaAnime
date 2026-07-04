import { Input } from "@/components/ui/input.component";
import Player from "@/components/shared/player.component";
import { Button } from "@/components/ui/button.component";
import { useMediaStore } from "@/store/media.store";
import { usePlayerStore } from "@/store/player.store";
import {
  ChapterType,
  FFMPEGStatus,
  ScanType,
  VideoFileEntry,
  VideoStreamInfo,
  type FolderNode,
  type VideoType,
} from "@/types";
import {
  Keyboard,
  FolderOpen,
  File,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Image,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { CHEATSHEET_ROWS } from "@/config/keybinds.config";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { buildTree, collectFolderPaths } from "@/lib/player.utils";
import { THUMB_INTERVAL } from "@/config/player.config";
import FFMPEG from "./components/player/ffmpeg.player";
import { getAction } from "@/config/keybinds.config";
import FolderView from "./components/player/folder.player";
import { useTorrentStore } from "@/store/download.store";
import TorrentFilesSection from "./components/torrent/file.torrent";
import ThumbnailPlayer from "./components/player/thumbnail.player";
import ContinueWatching from "./components/player/continue.player";
import { useSettingsStore } from "@/store/settings.store";

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
  const torrents = useTorrentStore((state) => state.torrents);
  const torrentFilesMap = useTorrentStore((state) => state.torrentFilesMap);
  const loadTorrentFiles = useTorrentStore((state) => state.loadTorrentFiles);
  const folderPaths = usePlayerStore((s) => s.folderPaths);
  const setFolderPaths = usePlayerStore((s) => s.setFolderPaths);
  const mediaGet = useMediaStore((s) => s.getEntry);

  const [video, setVideo] = useState<VideoType>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [chapters, setChapters] = useState<ChapterType[]>([]);
  const [streams, setStreams] = useState<VideoStreamInfo[]>([]);
  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([]);
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<ScanType>(null);
  const [showKeybinds, setShowKeybinds] = useState<boolean>(false);
  const [ffmpegStatus, setFfmpegStatus] = useState<FFMPEGStatus>("checking");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);
  const [autoAudio, setAutoAudio] = useState<string[]>([]);
  const [autoSubs, setAutoSubs] = useState<string[]>([]);
  const audioExtensions = useSettingsStore((s) => s.audioExtensions);
  const [genLabel, setGenLabel] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [genPaused, setGenPaused] = useState(false);
  const [upscaledFiles, setUpscaledFiles] = useState<Map<number, { name: string; size: number; fullPath: string }[]>>(new Map());
  const genCancelledRef = useRef(false);
  const genPausedRef = useRef(false);

  useEffect(() => {
    invoke<boolean>("check_ffprobe")
      .then((ok) => setFfmpegStatus(ok ? "ok" : "missing"))
      .catch(() => setFfmpegStatus("missing"));
  }, []);

  useEffect(() => {
    if (!video) {
      setChapters([]);
      setStreams([]);
    }
  }, [video]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.code === "Escape") {
        setShowKeybinds(false);
        return;
      }

      const action = getAction(e.code, e.ctrlKey, e.shiftKey, e.altKey);
      if (!action) return;

      e.preventDefault();

      switch (action.action) {
        case "toggleCheatsheet":
          setShowKeybinds((p) => !p);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const playGenRef = useRef(0);
  const tempFilesRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      if (!useSettingsStore.getState().autoCleanTempFiles) return;
      for (const p of tempFilesRef.current) {
        invoke("cleanup_temp_file", { path: p }).catch(() => { });
      }
      tempFilesRef.current = [];
    };
  }, []);

  const playFile = useCallback(
    (path: string) => {
      const gen = ++playGenRef.current;
      const savedEntry = mediaGet(path);
      const saved = savedEntry?.position;

      setVideo({
        path,
        file: path.split(/[/\\]/).pop() ?? "Video",
        initialTime: saved ?? 0,
        remuxSrc: undefined,
      });
      setVideoLoading(true);
      setChapters([]);
      setStreams([]);
      setAutoAudio([]);
      setAutoSubs([]);

      (async () => {
        try {
          const info = await invoke<{
            chapters: ChapterType[];
            streams: VideoStreamInfo[];
          }>("get_video_info", { path });
          if (gen !== playGenRef.current) return;
          setChapters(info.chapters);
          setStreams(info.streams);
          if (gen === playGenRef.current) setVideoLoading(false);

          const dir = path.split(/[/\\]/).slice(0, -1).join("/");
          invoke<{ audio: string[]; subtitles: string[] }>("scan_folder_for_tracks", { path: dir })
            .then((t) => {
              if (gen !== playGenRef.current) return;
              setAutoAudio(t.audio);
              setAutoSubs(t.subtitles);
            })
            .catch(() => { });

          const savedAudio = savedEntry?.audioTrack;
          if (savedAudio !== undefined) {
            const audioStreams = info.streams.filter(
              (s) => s.codec_type === "audio",
            );
            const defaultAudio =
              audioStreams.find((s) => s.is_default)?.index ??
              audioStreams[0]?.index ??
              -1;
            if (savedAudio !== defaultAudio) {
              const stream = audioStreams.find((s) => s.index === savedAudio);
              if (stream) {
                try {
                  const entry = mediaGet(path);
                  const audioDelay = Math.round((entry?.audioOffset ?? 0) * 1000);
                  const out = stream.file_path
                    ? await invoke<string>("remux_with_external_audio", {
                      videoPath: path,
                      audioPath: stream.file_path,
                      audioDelayMs: audioDelay,
                    })
                    : await invoke<string>("remux_video_audio", {
                      path,
                      streamIndex: savedAudio,
                      audioDelayMs: audioDelay,
                    });
                  if (gen !== playGenRef.current) return;
                  for (const p of tempFilesRef.current)
                    if (useSettingsStore.getState().autoCleanTempFiles)
                      invoke("cleanup_temp_file", { path: p }).catch(() => { });
                  tempFilesRef.current = [out];
                  if (gen !== playGenRef.current) return;
                  setVideo((prev) =>
                    prev?.path === path
                      ? { ...prev, remuxSrc: convertFileSrc(out) }
                      : prev,
                  );
                } catch { }
              }
            }
          }
        } catch {
          if (gen !== playGenRef.current) return;
          setChapters([]);
          setStreams([]);
        } finally {
          if (gen === playGenRef.current) setVideoLoading(false);
        }
      })();
    },
    [mediaGet],
  );

  useEffect(() => {
    if (folderPaths.length === 0) return;

    setLoading(true);
    setScanProgress({ current: 0, total: 0 });

    (async () => {
      const trees: FolderNode[] = [];

      for (let i = 0; i < folderPaths.length; i++) {
        setScanProgress({ current: i, total: folderPaths.length });

        try {
          const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
            path: folderPaths[i],
          });
          if (entries?.length) trees.push(buildTree(entries, folderPaths[i]));
        } catch { }
      }

      setFolderTrees(trees);
      setFolderPaths(trees.map((t) => t.path));

      setLoading(false);
      setScanProgress(null);
    })();
  }, [buildTree, setFolderPaths]);

  useEffect(() => {
    torrents.forEach((t) => {
      if (!torrentFilesMap[t.id]) {
        loadTorrentFiles(t.id);
      }
    });
  }, [torrents, torrentFilesMap, loadTorrentFiles]);

  useEffect(() => {
    if (folderPaths.length === 0) return;

    const interval = setInterval(async () => {
      const trees: FolderNode[] = [];
      for (const p of folderPaths) {
        try {
          const entries = await invoke<VideoFileEntry[]>("scan_video_folder", {
            path: p,
          });
          if (entries?.length) trees.push(buildTree(entries, p));
        } catch { }
      }
      if (trees.length > 0) setFolderTrees(trees);
    }, 30000);

    return () => clearInterval(interval);
  }, [folderPaths, buildTree, setFolderPaths]);

  const currentTreeFiles: VideoFileEntry[] = useMemo(() => {
    if (!video) return [];
    for (const tree of folderTrees) {
      const stack: FolderNode[] = [tree];
      while (stack.length > 0) {
        const item = stack.pop()!;
        if (item.files.some((f) => f.path === video.path)) {
          const result: VideoFileEntry[] = [];
          const s: FolderNode[] = [item];
          while (s.length > 0) {
            const n = s.pop()!;
            result.push(...n.files);
            s.push(...n.children);
          }
          return result;
        }
        stack.push(...item.children);
      }
    }
    return [];
  }, [folderTrees, video]);

  const currentIndex: number = useMemo(() => {
    if (!video) return -1;
    else return currentTreeFiles.findIndex((f) => f.path === video.path);
  }, [currentTreeFiles, video]);

  const hasNext: boolean =
    currentIndex >= 0 && currentIndex < currentTreeFiles.length - 1;
  const hasPrev: boolean = currentIndex > 0;

  const { onFileNext, onFilePrev } = useMemo(
    () => ({
      onFileNext: () => {
        if (hasNext && currentTreeFiles[currentIndex + 1])
          playFile(currentTreeFiles[currentIndex + 1].path);
      },
      onFilePrev: () => {
        if (hasPrev && currentTreeFiles[currentIndex - 1])
          playFile(currentTreeFiles[currentIndex - 1].path);
      },
    }),
    [hasPrev, hasNext, currentTreeFiles, currentIndex, playFile],
  );

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

    if (file) playFile(file);
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
      });

      if (!entries || entries.length === 0) return;

      const tree = buildTree(entries, folder);
      const next = [...folderTrees, tree];
      setFolderTrees(next);
      setFolderPaths(next.map((t) => t.path));
    } catch {
    } finally {
      const unlisten = await unlistenPromise;
      unlisten();
      setLoading(false);
      setScanProgress(null);
    }
  }, [folderTrees, setFolderPaths, buildTree]);

  const handleRemoveFolder = useCallback(
    (path: string) => {
      const tree = folderTrees.find((t) => t.path === path);
      if (tree) {
        const paths = collectFolderPaths([tree]);
        invoke("delete_thumbnails_for_paths", { paths })
          .then(() => setCacheRefreshKey((k) => k + 1))
          .catch(() => { });
      }
      setFolderTrees((prev) => {
        const next = prev.filter((t) => t.path !== path);
        setFolderPaths(next.map((t) => t.path));
        return next;
      });
    },
    [folderTrees, setFolderPaths],
  );

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runGeneration = useCallback(async (label: string, paths: string[]) => {
    if (paths.length === 0) return;
    genCancelledRef.current = false;
    genPausedRef.current = false;
    setGenPaused(false);
    setGenLabel(label);
    setGenProgress({ done: 0, total: paths.length });

    for (const p of paths) {
      if (genCancelledRef.current) break;
      while (genPausedRef.current && !genCancelledRef.current) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (genCancelledRef.current) break;

      try {
        await invoke("generate_thumbnails", {
          videoPath: p,
          interval: THUMB_INTERVAL,
        });
      } catch { }

      setGenProgress((prev) =>
        prev ? { ...prev, done: prev.done + 1 } : prev,
      );
    }

    if (!genCancelledRef.current) {
      setCacheRefreshKey((k) => k + 1);
    }
    setGenProgress(null);
    setGenPaused(false);
    setGenLabel(null);
  }, []);

  const handleGenerateAll = useCallback(async () => {
    const exts = new Set(useSettingsStore.getState().videoExtensions);
    const paths = new Set<string>();

    for (const p of collectFolderPaths(folderTrees)) paths.add(p);

    for (const [id, files] of Object.entries(torrentFilesMap)) {
      const t = torrents.find((t) => t.id === Number(id));
      if (!t) continue;
      for (const f of files) {
        const ext = f.name.split(".").pop()?.toLowerCase();
        if (ext && exts.has(ext)) paths.add(`${t.save_dir}/${f.name}`);
      }
    }

    runGeneration("Все папки и торренты", [...paths]);
  }, [folderTrees, torrentFilesMap, torrents, runGeneration]);

  const handleGenerateFolder = useCallback(
    async (path: string, name: string) => {
      const tree = folderTrees.find((t) => t.path === path);
      if (!tree) return;

      const exts = new Set(useSettingsStore.getState().videoExtensions);
      const paths = collectFolderPaths([tree]).filter((p) => {
        const ext = p.split(".").pop()?.toLowerCase();
        return ext && exts.has(ext);
      });

      runGeneration(`Папка: ${name}`, paths);
    },
    [folderTrees, runGeneration],
  );

  const handleGenerateTorrent = useCallback(
    async (id: number) => {
      const t = torrents.find((t) => t.id === id);
      const files = torrentFilesMap[id];
      if (!t || !files) return;

      const exts = new Set(useSettingsStore.getState().videoExtensions);
      const paths = files
        .filter((f) => f.completed)
        .map((f) => `${t.save_dir}/${f.name}`)
        .filter((p) => {
          const ext = p.split(".").pop()?.toLowerCase();
          return ext && exts.has(ext);
        });

      runGeneration(`Торрент: ${t.name}`, paths);
    },
    [torrents, torrentFilesMap, runGeneration],
  );

  const isGenerating = genProgress !== null;

  if (video)
    return (
      <main className="flex flex-col w-full h-full gap-1 overflow-y-auto">
        <Player
          header={video.file.replace(/\.[^/.]+$/, "")}
          src={video.remuxSrc ?? convertFileSrc(video.path)}
          onClose={() => setVideo(null)}
          audioReady={!!video.remuxSrc}
          chapters={chapters}
          mediaPath={video.path}
          streams={streams}
          initialTime={video.initialTime}
          onFileNext={onFileNext}
          onFilePrev={onFilePrev}
          hasNext={hasNext}
          hasPrev={hasPrev}
          cinemaMode={cinemaMode}
          autoHideUi={autoHideUi}
          onToggleCinema={onToggleCinema}
          onToggleAutoHide={onToggleAutoHide}
          loading={videoLoading}
          autoAudio={autoAudio}
          autoSubs={autoSubs}
        />
      </main>
    );

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
        <Button
          size="icon"
          className="ml-auto h-6 w-6"
          title="Горячие клавиши"
          onClick={() => setShowKeybinds((prev) => !prev)}
        >
          <Keyboard />
        </Button>
      </section>

      {/* FFMPEG STATUS */}
      <section className="flex flex-row w-full h-8 windows95-active-border bg-primary gap-1 p-1 items-center">
        <FFMPEG
          status={ffmpegStatus}
          setStatus={setFfmpegStatus}
          video={video}
          setChapters={setChapters}
          setStreams={setStreams}
        />
        <span className="ml-auto text-[10px] text-muted">v8.1</span>
      </section>

      {/* THUMBNAIL CACHE */}
      <ThumbnailPlayer
        ffmpegStatus={ffmpegStatus}
        cacheRefreshKey={cacheRefreshKey}
        generatingLabel={genLabel}
        progress={genProgress}
        paused={genPaused}
        onGenerateAll={handleGenerateAll}
        onPause={() => {
          genPausedRef.current = !genPausedRef.current;
          setGenPaused((p) => !p);
        }}
        onStop={() => {
          genCancelledRef.current = true;
          genPausedRef.current = false;
          setGenProgress(null);
          setGenPaused(false);
          setGenLabel(null);
        }}
        onClear={async () => {
          try {
            await invoke("clear_thumbnail_cache");
            setCacheRefreshKey((k) => k + 1);
          } catch { }
        }}
      />

      {/* CONTINUE WATCHING */}
      <ContinueWatching onPlay={playFile} />

      {/* KEYBINDS */}
      {showKeybinds && (
        <section className="relative windows95-active-border bg-primary p-1 h-fit">
          <Button
            size="icon"
            className="absolute top-1 right-1 flex items-center justify-center size-6"
            onClick={() => setShowKeybinds(false)}
          >
            <X />
          </Button>
          <span className="windows95-text block mb-1">Горячие клавиши</span>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] windows95-font">
            {CHEATSHEET_ROWS.flatMap((row) => [
              <span key={`${row.keys}-key`}>{row.keys}</span>,
              <span key={`${row.keys}-desc`}>{row.description}</span>,
            ])}
          </div>
        </section>
      )}
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

      {folderTrees.length > 0 && (
        <section className="flex flex-col w-full windows95-text gap-2 p-1">
          {folderTrees.map((tree) => (
            <div key={tree.path} className="flex flex-col windows95-active-border bg-primary">
              <FolderView
                node={tree}
                depth={0}
                onPlay={playFile}
                searchQuery={search}
                onRemove={handleRemoveFolder}
                onGenerate={handleGenerateFolder}
                disabledExtensions={new Set(audioExtensions)}
              />
            </div>
          ))}
        </section>
      )}

      {/* TORRENTS */}
      {torrents.map((item, index) => {
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
              <Button
                size="icon"
                className="size-4"
                title="Сгенерировать превью"
                disabled={isGenerating}
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerateTorrent(item.id);
                }}
              >
                <Image className="size-3" />
              </Button>
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
                    onPlay={playFile}
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
