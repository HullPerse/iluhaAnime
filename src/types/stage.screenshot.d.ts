import type { ScreenshotLayersPayload } from "@/types/screenshot";

export interface StageHandle {
  layers: () => ScreenshotLayersPayload | null;
}
