import { openPath } from "@tauri-apps/plugin-opener";

export async function openFileInPlayer(filePath: string) {
  const normalized = filePath.replace(/\//g, "\\");
  await openPath(normalized);
}
