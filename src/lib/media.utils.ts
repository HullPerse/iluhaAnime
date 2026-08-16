import { openPath } from "@tauri-apps/plugin-opener";

export function joinMediaPath(basePath: string, relativePath: string): string {
  return `${basePath.replace(/[\\/]+$/, "")}/${relativePath.replace(/^[/\\\\]+/, "")}`;
}

export async function openFileInPlayer(filePath: string) {
  const normalized = filePath.replaceAll(/\//g, "\\");
  await openPath(normalized);
}
