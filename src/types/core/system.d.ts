import type { ApiTransport } from "./transport.api";
import type { CropRect, ScreenshotFormat, ScreenshotLayersPayload } from "@/types/core/screenshot";

export interface SystemApiConfig {
  transport?: ApiTransport;
}

export interface SaveScreenshotInput {
  sourcePath: string;
  dir: string;
  name: string;
  format: ScreenshotFormat;
  crop: CropRect | null;
  layers?: ScreenshotLayersPayload;
}
