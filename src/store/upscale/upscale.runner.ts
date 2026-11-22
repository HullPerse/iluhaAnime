import { listen } from "@tauri-apps/api/event";
import { attempt } from "@hullperse/hp_utils/attempt";

import { invokeTyped } from "@/lib/core/system/invoke.utils";
import { UpscaleProgressSchema } from "@/schemas/upscale.schema";
import type {
  ConvertConfig,
  UpscaleConfig,
  UpscaleProgressPayload,
  UpscaleQueueItem,
} from "@/types/core/upscale";

export async function runUpscaleJob(
  item: UpscaleQueueItem,
  onProgress: (payload: UpscaleProgressPayload) => void
): Promise<void> {
  const unlisten = await listen<unknown>("upscale-progress", (event) => {
    const progress = UpscaleProgressSchema.safeParse(event.payload);

    if (progress.success) onProgress(progress.data);
  });

  const [, error] = await attempt(
    (async () => {
      if (item.jobType === "upscale") {
        const config = item.config as UpscaleConfig;
        await invokeTyped("upscale_video", {
          inputPath: item.filePath,
          outputPath: item.outputPath,
          width: config.width,
          height: config.height,
          targetFps: config.targetFps,
          interpolate: config.interpolate,
          quality: config.quality,
          gpuBackend: config.gpuBackend,
          videoCodec: config.videoCodec,
          aiUpscaler: config.aiUpscaler,
          selectedShaders: config.selectedShaders,
          temporalDenoise: config.temporalDenoise,
        });

        return;
      }

      const config = item.config as ConvertConfig;
      await invokeTyped("convert_video", {
        inputPath: item.filePath,
        outputPath: item.outputPath,
        targetFormat: config.targetFormat,
        copyStreams: config.copyStreams,
      });
    })()
  ).finally(unlisten);

  if (error !== null) throw error;
}
