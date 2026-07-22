import { useUpscaleQueueStore } from "@/store/upscale.store";
import { Button } from "@/components/ui/button.component";
import {
  Trash2,
  X,
  RefreshCw,
  ListVideo,
  Loader,
  FileVideo,
  Pause,
  Play,
} from "lucide-react";

export default function QueuePanel() {
  const items = useUpscaleQueueStore((s) => s.items);
  const paused = useUpscaleQueueStore((s) => s.paused);
  const removeItem = useUpscaleQueueStore((s) => s.removeItem);
  const clearDone = useUpscaleQueueStore((s) => s.clearDone);
  const clearAll = useUpscaleQueueStore((s) => s.clearAll);
  const restartItem = useUpscaleQueueStore((s) => s.restartItem);
  const setPaused = useUpscaleQueueStore((s) => s.setPaused);

  if (items.length === 0) return null;

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued":
        return <ListVideo className="size-3 text-muted" />;
      case "processing":
        return <Loader className="size-3 animate-spin text-highlight" />;
      case "done":
        return <span className="size-3 text-success">✓</span>;
      case "error":
        return <span className="size-3 text-destructive">✗</span>;
    }
  };

  const activeCount = items.filter((i) => i.status !== "done").length;
  const hasProcessing = items.some((i) => i.status === "processing");
  const upscaleCount = items.filter(
    (i) => i.jobType === "upscale" && i.status !== "done",
  ).length;
  const convertCount = items.filter(
    (i) => i.jobType === "convert" && i.status !== "done",
  ).length;

  return (
    <section className="windows95-active-border bg-primary p-1">
      <div className="flex items-center gap-1 windows95-text text-xs font-bold mb-1">
        <ListVideo className="size-3" />
        Очередь ({activeCount})
        {upscaleCount > 0 && (
          <span className="text-muted font-normal">апскейл:{upscaleCount}</span>
        )}
        {convertCount > 0 && (
          <span className="text-muted font-normal">конв:{convertCount}</span>
        )}
        <div className="ml-auto flex gap-1">
          {hasProcessing && (
            <Button
              size="icon"
              className="h-4 w-4"
              onClick={() => setPaused(!paused)}
              title={paused ? "Продолжить" : "Пауза"}
            >
              {paused ? (
                <Play className="size-2.5" />
              ) : (
                <Pause className="size-2.5" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={clearDone}
            title="Удалить завершённые"
          >
            <Trash2 className="size-2.5" />
          </Button>
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={clearAll}
            title="Очистить очередь"
          >
            <X className="size-2.5" />
          </Button>
        </div>
      </div>
      {paused && (
        <div className="windows95-text text-[10px] text-highlight mb-1">
          Пауза
        </div>
      )}
      <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1 windows95-text text-[10px] bg-white px-1 py-0.5"
          >
            {item.jobType === "convert" ? (
              <FileVideo className="size-3 text-muted" />
            ) : (
              statusIcon(item.status)
            )}
            {item.jobType === "convert" && item.status === "processing" && (
              <Loader className="size-3 animate-spin text-highlight" />
            )}
            <span className="truncate flex-1">{item.name}</span>

            {item.status === "queued" && (
              <Button
                size="icon"
                className="h-3 w-3"
                onClick={() => removeItem(item.id)}
                title="Удалить"
              >
                <X className="size-2" />
              </Button>
            )}
            {item.status === "error" && (
              <>
                <span className="text-destructive truncate max-w-25">
                  {item.error}
                </span>
                <Button
                  size="icon"
                  className="h-3 w-3"
                  onClick={() => restartItem(item.id)}
                  title="Повторить"
                >
                  <RefreshCw className="size-2" />
                </Button>
              </>
            )}
            {item.status === "processing" && (
              <div className="flex items-center gap-1 min-w-0">
                <div className="w-20 h-4 windows95-border bg-white">
                  <div
                    className="h-full bg-secondary"
                    style={{ width: `${item.progress}%`, transition: "none" }}
                  />
                </div>
                <span className="text-[10px] shrink-0 w-8 text-right">
                  {item.progress}%
                </span>
              </div>
            )}
            {item.status === "done" && (
              <Button
                size="icon"
                className="h-3 w-3"
                onClick={() => removeItem(item.id)}
                title="Удалить"
              >
                <X className="size-2" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
