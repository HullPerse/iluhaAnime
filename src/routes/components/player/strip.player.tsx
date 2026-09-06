import ProgressBar from "@/components/shared/progress.component";
import { useUpscaleQueueStore } from "@/store/upscale.store";

export function QueueStrip() {
  const items = useUpscaleQueueStore((s) => s.items);
  const active =
    items.find((i) => i.status === "processing") ?? items.find((i) => i.status === "queued");
  if (!active) return null;
  return (
    <div className="ui-panel sticky bottom-0 flex flex-row items-center gap-1 p-1">
      <span className="windows95-text min-w-0 flex-1 truncate text-xs" title={active.name}>
        {active.name}
      </span>
      <ProgressBar className="h-3 w-32 shrink-0" value={active.progress} max={100} />
      <span className="windows95-text text-hint w-10 shrink-0 text-right text-xs">
        {active.progress}%
      </span>
    </div>
  );
}
