import { attemptSync } from "@/lib/core/attempt.utils";
import type { CropBounds } from "@/types/core/screenshot";

export const paintOffscreen = (
  bounds: CropBounds,
  paint: (context: CanvasRenderingContext2D) => void
): string | undefined => {
  const [url] = attemptSync(() => {
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    paint(context);
    return canvas.toDataURL("image/png");
  });
  return url ?? undefined;
};
