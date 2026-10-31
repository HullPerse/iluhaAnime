import type { TFunc } from "@/types/core/i18n";
import type { ConvertConfig, UpscaleConfig, UpscaleQueueItem } from "@/types/core/upscale";
import type { QueueDepthStep } from "@/types/player/playerQueue";

const STAGE_ORDER: Record<string, number> = {
  encoding: 2,
  interpolating: 1,
  upscaling: 1,
  extracting: 0,
  initializing: 0,
  started: 0,
};

function stageIndex(stage: string | undefined): number {
  return stage ? (STAGE_ORDER[stage] ?? -1) : -1;
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
  const currentStage: Record<string, () => number> = {
    done: () => defs.length,
    processing: () => Math.max(0, stageIndex(item.stage)),
  };
  const current = currentStage[item.status]?.() ?? -1;
  return defs.map((step, index) => {
    const settled = index < current || item.status === "done";
    let percent = 0;
    if (settled) percent = 100;
    else if (index === current) percent = item.progress;
    return {
      ...step,
      done: settled,
      active: index === current && item.status === "processing",
      percent,
    };
  });
}
