import { openPath } from "@tauri-apps/plugin-opener";

import { translate } from "@/lib/locale/i18n.utils";
import { showError } from "@/lib/utils/notification.utils";
import { useSettingsStore } from "@/store/settings.store";

export function joinMediaPath(basePath: string, relativePath: string): string {
  return `${basePath.replace(/[\\/]+$/, "")}/${relativePath.replace(/^[/\\\\]+/, "")}`;
}

export async function openFileInPlayer(filePath: string) {
  const normalized = filePath.replaceAll(/\//g, "\\");
  try {
    await openPath(normalized);
  } catch (error) {
    showError(
      translate(useSettingsStore.getState().language, "player.folder.open.failed"),
      String(error)
    );
  }
}
