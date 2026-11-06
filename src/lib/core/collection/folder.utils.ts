import { FOLDER_MAX_VIEWPORT_MARGIN, FOLDER_MIN_HEIGHT } from "@/config/system/folders.config";

export function maxFolderHeight(): number {
  return Math.max(FOLDER_MIN_HEIGHT, window.innerHeight - FOLDER_MAX_VIEWPORT_MARGIN);
}
