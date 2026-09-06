import { Ban, ListVideo } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatETA } from "@/lib/player/title.utils";
import type { UpscaleQueueItem } from "@/types";

export function UpscaleProgressPanel({
  activeItem,
  onCancel,
}: {
  activeItem: UpscaleQueueItem | null;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  if (!activeItem) return null;
  const stage =
    activeItem.current != null && activeItem.total != null && activeItem.total > 0
      ? "encoding"
      : activeItem.status === "processing"
        ? "initializing"
        : null;
  const etaSecs =
    activeItem.speed &&
    activeItem.speed > 0 &&
    activeItem.current != null &&
    activeItem.total != null
      ? (activeItem.total - activeItem.current) / activeItem.speed
      : null;

  return (
    <div className="flex min-w-xl flex-col gap-2 p-1">
      {activeItem.status === "queued" && (
        <div className="flex flex-col items-center gap-2 py-4">
          <ListVideo className="text-hint size-5" />
          <span className="windows95-text text-xs">{t("player.upscale.queued")}</span>
        </div>
      )}

      {activeItem.status === "processing" && stage === "initializing" && (
        <div className="flex flex-col items-center gap-2 py-4">
          <SmallLoader size={5} />
          <span className="windows95-text text-xs">{t("player.upscale.initializing")}</span>
        </div>
      )}

      {stage === "encoding" && (
        <>
          <ProgressBar value={activeItem.current ?? 0} max={activeItem.total ?? 1} />
          <span className="windows95-text text-center text-xs">{activeItem.progress ?? 0}%</span>
          {etaSecs != null && (
            <span className="windows95-text text-hint text-center text-xs">
              {t("player.upscale.eta", { time: formatETA(etaSecs, t) })}
            </span>
          )}
        </>
      )}

      <div className="mt-1 flex flex-row justify-center gap-1">
        <Button variant="destructive" onClick={onCancel}>
          <Ban className="size-3" />
          {t("player.upscale.cancel")}
        </Button>
      </div>
    </div>
  );
}
