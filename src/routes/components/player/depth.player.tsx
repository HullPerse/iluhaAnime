import ProgressBar from "@/components/shared/progress.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { queueDepthSteps } from "@/lib/player/queue.utils";
import type { UpscaleQueueItem } from "@/types/upscale";

export function QueueItemDepth({ item }: { item: UpscaleQueueItem }) {
  const { t } = useI18n();
  const steps = queueDepthSteps(item, t);
  const failed = item.status === "error";
  return (
    <div className="flex flex-col gap-0.5 border-t border-black/10 px-1 py-1">
      {steps.map((step) => (
        <div key={step.key} className="flex flex-row items-center gap-1">
          <span className="windows95-text w-24 shrink-0 truncate text-xs" title={step.detail}>
            {step.label}
          </span>
          <ProgressBar
            className="h-2 flex-1"
            value={step.percent}
            max={100}
            barClassName={failed && step.active ? "bg-red-700" : undefined}
          />
          <span
            className="windows95-text text-hint w-28 shrink-0 truncate text-right text-xs"
            title={step.detail}
          >
            {step.detail}
          </span>
        </div>
      ))}
    </div>
  );
}
