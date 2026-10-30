import type { ScreenshotTool } from "@/types/core/screenshot";

export const paintsWithColor = (tool: ScreenshotTool): boolean => {
  return tool === "pencil" || tool === "text";
};
