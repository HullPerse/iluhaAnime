import { Check, Trash2, X, RefreshCw, ListVideo, FileVideo, Pause, Play } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useUpscaleQueueStore } from "@/store/upscale.store";
import type { ScanType } from "@/types/player";

import { QueueItemDepth } from "./depth.player";
import FolderScanProgress from "./scan.player";

export default function QueuePanel({ scan }: { scan: ScanType }) {
  const items = useUpscaleQueueStore((s) => s.items);
  const paused = useUpscaleQueueStore((s) => s.paused);
  const removeItem = useUpscaleQueueStore((s) => s.removeItem);
  const clearDone = useUpscaleQueueStore((s) => s.clearDone);
  const clearAll = useUpscaleQueueStore((s) => s.clearAll);
  const restartItem = useUpscaleQueueStore((s) => s.restartItem);
  const setPaused = useUpscaleQueueStore((s) => s.setPaused);
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0 && !scan) return null;

  const statusIcon = (status: string) => {
    switch (status) {
      case "queued": {
        return <ListVideo className="text-hint size-3" />;
      }
      case "processing": {
        return <SmallLoader size={3} className="text-highlight" />;
      }
      case "done": {
        return <Check className="text-success size-3" />;
      }
      case "error": {
        return <X className="text-destructive size-3" />;
      }
    }
  };

  const activeCount = items.filter((i) => i.status !== "done").length;
  const hasProcessing = items.some((i) => i.status === "processing");

  return (
    <section className="windows95-active-border bg-primary p-1">
      <div className="windows95-text mb-1 flex items-center gap-1 text-xs font-bold">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left"
        >
          {open ? "▼" : "▶"} <ListVideo className="size-3" />
          <span className="truncate">{t("player.queue.title", { count: activeCount })}</span>
        </button>
        <div className="ml-auto flex gap-1">
          {(activeCount > 0 || hasProcessing) && (
            <Button
              size="icon"
              className="h-4 w-4"
              onClick={() => setPaused(!paused)}
              title={paused ? t("player.queue.resume") : t("player.queue.pause")}
            >
              {paused ? <Play className="size-2.5" /> : <Pause className="size-2.5" />}
            </Button>
          )}
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={clearDone}
            title={t("player.queue.clear.done")}
          >
            <Trash2 className="size-2.5" />
          </Button>
          <Button
            size="icon"
            className="h-4 w-4"
            onClick={clearAll}
            title={t("player.queue.clear.all")}
          >
            <X className="size-2.5" />
          </Button>
        </div>
      </div>
      {open ? (
        <>
          {paused && (
            <div className="windows95-text text-highlight mb-1 text-xs">
              {t("player.queue.paused")}
            </div>
          )}
          {scan ? (
            <div className="mb-1">
              <FolderScanProgress scanProgress={scan} />
            </div>
          ) : null}
          <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="windows95-text flex flex-col bg-white px-1 py-0.5 text-xs"
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={expandedId === item.id}
                    onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left"
                  >
                    {item.jobType === "convert" ? (
                      <FileVideo className="text-hint size-3" />
                    ) : (
                      statusIcon(item.status)
                    )}
                    {item.jobType === "convert" && item.status === "processing" && (
                      <SmallLoader size={3} className="text-highlight" />
                    )}
                    <span className="flex-1 truncate">{item.name}</span>
                  </button>
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
                      <span className="text-destructive max-w-25 truncate">{item.error}</span>
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
                          className="bg-secondary h-full transition-none"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs">{item.progress}%</span>
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
                {expandedId === item.id ? <QueueItemDepth item={item} /> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
