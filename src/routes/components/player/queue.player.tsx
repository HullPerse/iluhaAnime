import {
  Trash2,
  X,
  RefreshCw,
  ListVideo,
  FileVideo,
  Pause,
  Play,
} from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/lib/i18n";
import { useUpscaleQueueStore } from "@/store/upscale.store";

export default function QueuePanel() {
  const items = useUpscaleQueueStore((s) => s.items);
  const paused = useUpscaleQueueStore((s) => s.paused);
  const removeItem = useUpscaleQueueStore((s) => s.removeItem);
  const clearDone = useUpscaleQueueStore((s) => s.clearDone);
  const clearAll = useUpscaleQueueStore((s) => s.clearAll);
  const restartItem = useUpscaleQueueStore((s) => s.restartItem);
  const setPaused = useUpscaleQueueStore((s) => s.setPaused);
  const { t } = useI18n();

  if (items.length === 0) return null;

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": {
        return <ListVideo className="text-muted size-3" />;
      }
      case "processing": {
        return <SmallLoader size={3} className="text-highlight" />;
      }
      case "done": {
        return <span className="text-success size-3">✓</span>;
      }
      case "error": {
        return <span className="text-destructive size-3">✗</span>;
      }
    }
  };

  const activeCount = items.filter((i) => i.status !== "done").length;
  const hasProcessing = items.some((i) => i.status === "processing");
  const upscaleCount = items.filter(
    (i) => i.jobType === "upscale" && i.status !== "done"
  ).length;
  const convertCount = items.filter(
    (i) => i.jobType === "convert" && i.status !== "done"
  ).length;

  return (
    <section className="windows95-active-border bg-primary p-1">
      <div className="windows95-text mb-1 flex items-center gap-1 text-xs font-bold">
        <ListVideo className="size-3" />
        {t("player.queue.title", { count: activeCount })}
        {upscaleCount > 0 && (
          <span className="text-muted font-normal">
            {t("player.queue.upscaleShort", { count: upscaleCount })}
          </span>
        )}
        {convertCount > 0 && (
          <span className="text-muted font-normal">
            {t("player.queue.convertShort", { count: convertCount })}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {(activeCount > 0 || hasProcessing) && (
            <Button
              size="icon"
              className="h-4 w-4"
              onClick={() => setPaused(!paused)}
              title={
                paused ? t("player.queue.resume") : t("player.queue.pause")
              }
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
            title={t("player.queue.clearDone")}
          >
            <Trash2 className="size-2.5" />
          </Button>
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={clearAll}
            title={t("player.queue.clearAll")}
          >
            <X className="size-2.5" />
          </Button>
        </div>
      </div>
      {paused && (
        <div className="windows95-text text-highlight mb-1 text-[10px]">
          {t("player.queue.paused")}
        </div>
      )}
      <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="windows95-text flex items-center gap-1 bg-white px-1 py-0.5 text-[10px]"
          >
            {item.jobType === "convert" ? (
              <FileVideo className="text-muted size-3" />
            ) : (
              statusIcon(item.status)
            )}
            {item.jobType === "convert" && item.status === "processing" && (
              <SmallLoader size={3} className="text-highlight" />
            )}
            <span className="flex-1 truncate">{item.name}</span>

            {item.status === "queued" && (
              <Button
                size="icon"
                className="h-3 w-3"
                onClick={() => removeItem(item.id)}
                title={t("common.delete")}
              >
                <X className="size-2" />
              </Button>
            )}
            {item.status === "error" && (
              <>
                <span className="text-destructive max-w-25 truncate">
                  {item.error}
                </span>
                <Button
                  size="icon"
                  className="h-3 w-3"
                  onClick={() => restartItem(item.id)}
                  title={t("player.queue.retry")}
                >
                  <RefreshCw className="size-2" />
                </Button>
              </>
            )}
            {item.status === "processing" && item.current !== undefined && (
              <div className="flex min-w-0 items-center gap-1">
                <div className="windows95-border h-4 w-20 bg-white">
                  <div
                    className="bg-secondary h-full"
                    style={{ width: `${item.progress}%`, transition: "none" }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[10px]">
                  {item.progress}%
                </span>
              </div>
            )}
            {item.status === "done" && (
              <Button
                size="icon"
                className="h-3 w-3"
                onClick={() => removeItem(item.id)}
                title={t("common.delete")}
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
