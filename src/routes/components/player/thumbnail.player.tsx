import { Button } from "@/components/ui/button.component";
import { fmtSize } from "@/lib/torrent.utils";
import { THUMB_INTERVAL } from "@/config/player.config";
import { useSettingsStore } from "@/store/settings.store";
import { invoke } from "@tauri-apps/api/core";
import { Pause, Play, Square } from "lucide-react";
import { FolderNode, TorrentFileInfo } from "@/types/torrent";
import { TorrentInfo } from "@/types/torrent";
import { useCallback, useEffect, useRef, useState } from "react";
import { FFMPEGStatus } from "@/types/player";
import { collectFolderPaths } from "@/lib/player.utils";

function ThumbnailPlayer({
  folderTrees,
  torrentFilesMap,
  torrents,
  ffmpegStatus,
  cacheRefreshKey,
}: {
  folderTrees: FolderNode[];
  torrentFilesMap: Record<number, TorrentFileInfo[]>;
  torrents: TorrentInfo[];
  ffmpegStatus: FFMPEGStatus;
  cacheRefreshKey: number;
}) {
  const [cacheInfo, setCacheInfo] = useState<{
    size: number;
    count: number;
  } | null>(null);
  const [precacheProgress, setPrecacheProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [precachePaused, setPrecachePaused] = useState(false);
  const cancelledRef = useRef(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    invoke<{ size_bytes: number; path_count: number }>(
      "get_thumbnail_cache_info",
    )
      .then((info) =>
        setCacheInfo({ size: info.size_bytes, count: info.path_count }),
      )
      .catch(() => setCacheInfo(null));
  }, [cacheRefreshKey]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const handlePrecache = useCallback(async () => {
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

    const allPaths = [...paths];
    if (allPaths.length === 0) return;

    cancelledRef.current = false;
    pausedRef.current = false;
    setPrecachePaused(false);
    setPrecacheProgress({ done: 0, total: allPaths.length });

    for (const p of allPaths) {
      if (cancelledRef.current) break;
      while (pausedRef.current && !cancelledRef.current) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (cancelledRef.current) break;

      try {
        await invoke("generate_thumbnails", {
          videoPath: p,
          interval: THUMB_INTERVAL,
        });
      } catch {}

      setPrecacheProgress((prev) =>
        prev ? { ...prev, done: prev.done + 1 } : prev,
      );
    }

    if (!cancelledRef.current) {
      invoke<{ size_bytes: number; path_count: number }>(
        "get_thumbnail_cache_info",
      )
        .then((info) =>
          setCacheInfo({ size: info.size_bytes, count: info.path_count }),
        )
        .catch(() => {});
    }
    setPrecacheProgress(null);
    setPrecachePaused(false);
  }, [folderTrees, torrentFilesMap, torrents]);

  const handlePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPrecachePaused((p) => !p);
  }, []);

  const handleStop = useCallback(() => {
    cancelledRef.current = true;
    pausedRef.current = false;
    setPrecacheProgress(null);
    setPrecachePaused(false);
  }, []);

  const handleClearCache = useCallback(async () => {
    try {
      await invoke("clear_thumbnail_cache");
      setCacheInfo({ size: 0, count: 0 });
    } catch {}
  }, []);

  const isRunning = precacheProgress !== null;
  const generating = isRunning && !precachePaused;

  return (
    <section className="flex flex-col w-full windows95-active-border bg-primary p-1">
      <div className="flex flex-row items-center gap-1">
        <span className="windows95-text text-[10px]">
          {`Превью: ${
            cacheInfo
              ? `${cacheInfo.count} файлов, ${fmtSize(cacheInfo.size)}`
              : "..."
          }`}
        </span>
        <Button
          rendered={!isRunning}
          onClick={handlePrecache}
          disabled={isRunning || ffmpegStatus !== "ok"}
          className="ml-auto"
        >
          Сгенерировать
        </Button>
        {isRunning ? (
          <div className="ml-auto gap-1 flex flex-row">
            <Button
              variant="secondary"
              size="icon"
              className="size-6"
              onClick={handlePause}
            >
              {generating ? (
                <Pause className="size-3" />
              ) : (
                <Play className="size-3" />
              )}
            </Button>
            <Button
              variant="error"
              size="icon"
              className="size-6"
              onClick={handleStop}
            >
              <Square className="size-3" />
            </Button>
          </div>
        ) : null}
        <Button
          rendered={!isRunning}
          onClick={handleClearCache}
          disabled={isRunning}
        >
          Очистить
        </Button>
      </div>
      {isRunning && (
        <div className="flex flex-row items-center gap-1 mt-1">
          <div className="flex-1 h-3 windows95-border bg-white">
            <div
              className="h-full bg-secondary"
              style={{
                width: `${(precacheProgress.done / precacheProgress.total) * 100}%`,
              }}
            />
          </div>
          <span className="text-[10px] shrink-0">
            {precacheProgress.done}/{precacheProgress.total}
          </span>
        </div>
      )}
    </section>
  );
}

export default ThumbnailPlayer;
