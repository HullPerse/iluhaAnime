import { Button } from "@/components/ui/button.component";
import { fmtSize } from "@/lib/torrent.utils";
import { invoke } from "@tauri-apps/api/core";
import { Pause, Play, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { FFMPEGStatus } from "@/types/player";

function ThumbnailPlayer({
  ffmpegStatus,
  cacheRefreshKey,
  generatingLabel,
  progress,
  paused,
  onGenerateAll,
  onPause,
  onStop,
  onClear,
}: {
  ffmpegStatus: FFMPEGStatus;
  cacheRefreshKey: number;
  generatingLabel: string | null;
  progress: { done: number; total: number } | null;
  paused: boolean;
  onGenerateAll: () => void;
  onPause: () => void;
  onStop: () => void;
  onClear: () => void;
}) {
  const [cacheInfo, setCacheInfo] = useState<{
    size: number;
    count: number;
  } | null>(null);

  useEffect(() => {
    invoke<{ size_bytes: number; path_count: number }>(
      "get_thumbnail_cache_info",
    )
      .then((info) =>
        setCacheInfo({ size: info.size_bytes, count: info.path_count }),
      )
      .catch(() => setCacheInfo(null));
  }, [cacheRefreshKey]);

  const isRunning = progress !== null;
  const generating = isRunning && !paused;

  return (
    <section className="flex flex-col w-full windows95-active-border bg-primary p-1">
      <div className="flex flex-row items-center gap-1">
        <span className="windows95-text text-[10px]">
          {generatingLabel && progress
            ? `Генерация превью: ${generatingLabel}`
            : `Превью: ${cacheInfo
              ? `${cacheInfo.count} файлов, ${fmtSize(cacheInfo.size)}`
              : "..."
            }`}
        </span>
        <Button
          rendered={!isRunning}
          onClick={onGenerateAll}
          disabled={isRunning || ffmpegStatus !== "ok"}
          className="ml-auto"
        >
          Сгенерировать всё
        </Button>
        {isRunning ? (
          <div className="ml-auto gap-1 flex flex-row">
            <Button
              variant="secondary"
              size="icon"
              className="size-6"
              onClick={onPause}
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
              onClick={onStop}
            >
              <Square className="size-3" />
            </Button>
          </div>
        ) : null}
        <Button
          rendered={!isRunning}
          onClick={onClear}
          disabled={isRunning}
        >
          Очистить
        </Button>
      </div>
      {isRunning && (
        <div className="flex flex-row items-center gap-1 mt-1">
          <div className="flex-1 h-3 windows95-border bg-white overflow-hidden">
            <div
              className="h-full bg-secondary"
              style={{
                width: `${(progress.done / progress.total) * 100}%`,
              }}
            />
          </div>
          <span className="text-[10px] shrink-0">
            {progress.done}/{progress.total}
          </span>
        </div>
      )}
    </section>
  );
}

export default ThumbnailPlayer;
