import type { PreviewFrame } from "@/types/core/upscale";

export interface UpscalePreviewController {
  frames: PreviewFrame[];
  loading: boolean;
  error: string | null;
  load: () => void;
}
