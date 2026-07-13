import { useUpscaleQueueStore } from "@/store/upscale.store";
import { Button } from "@/components/ui/button.component";
import ProgressBar from "@/components/shared/progress.component";
import { Trash2, X, RefreshCw, ListVideo, Loader } from "lucide-react";

export default function QueuePanel() {
  const items = useUpscaleQueueStore((s) => s.items);
  const removeItem = useUpscaleQueueStore((s) => s.removeItem);
  const clearDone = useUpscaleQueueStore((s) => s.clearDone);
  const clearAll = useUpscaleQueueStore((s) => s.clearAll);
  const restartItem = useUpscaleQueueStore((s) => s.restartItem);

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

  return (
    <section className="windows95-active-border bg-primary p-1">
      <div className="flex items-center gap-1 windows95-text text-xs font-bold mb-1">
        <ListVideo className="size-3" />
        Очередь апскейла ({items.filter((i) => i.status !== "done").length})
        <div className="ml-auto flex gap-1">
          <Button size="icon" className="h-4 w-4" onClick={clearDone} title="Удалить завершённые">
            <Trash2 className="size-2.5" />
          </Button>
          <Button size="icon" className="h-4 w-4" onClick={clearAll} title="Очистить очередь">
            <X className="size-2.5" />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-1 windows95-text text-[10px] bg-white px-1 py-0.5"
          >
            {statusIcon(item.status)}
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
                <span className="text-destructive truncate max-w-[100px]">{item.error}</span>
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
              <div className="w-16">
                <ProgressBar value={item.progress} max={100} />
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
