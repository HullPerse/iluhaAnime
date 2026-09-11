import type { ConvertConfig, UpscaleConfig, UpscaleQueueItem } from "@/types/upscale";
import type { TFunc } from "@/types/i18n";

export interface QueueDepthStep {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  active: boolean;
  percent: number;
}

function stageIndex(stage: string | undefined): number {
  if (stage === "encoding") return 2;
  if (stage === "interpolating" || stage === "upscaling") return 1;
  if (stage === "initializing" || stage === "started") return 0;
  return -1;
}

export function queueDepthSteps(item: UpscaleQueueItem, t: TFunc): QueueDepthStep[] {
  if (item.jobType === "convert") {
    const cfg = item.config as ConvertConfig;
    const done = item.status === "done";
    return [
      {
        key: "convert",
        label: t("player.queue.step.convert"),
        detail: cfg.targetFormat,
        done,
        active: !done && item.status === "processing",
        percent: done ? 100 : item.progress,
      },
    ];
  }
  const cfg = item.config as UpscaleConfig;
  const upscaleDetail =
    cfg.aiUpscaler ?? [...(cfg.selectedShaders ?? []), cfg.quality].filter(Boolean).join(" + ");
  const defs = [
    { key: "extract", label: t("player.queue.step.extract"), detail: "jpg q2" },
    { key: "upscale", label: t("player.queue.step.upscale"), detail: upscaleDetail },
    { key: "encode", label: t("player.queue.step.encode"), detail: cfg.videoCodec },
  ];
  const current =
    item.status === "done"
      ? defs.length
      : item.status === "processing"
        ? stageIndex(item.stage)
        : -1;
  return defs.map((step, index) => ({
    ...step,
    done: index < current || item.status === "done",
    active: index === current && item.status === "processing",
    percent:
      index < current || item.status === "done" ? 100 : index === current ? item.progress : 0,
  }));
}
