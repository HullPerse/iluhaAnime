import type { ScreenshotLayersPayload } from "@/types/core/screenshot";

export interface StageHandle {
  layers: () => ScreenshotLayersPayload | null;
}
