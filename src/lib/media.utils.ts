import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { useSettingsStore } from "@/store/settings.store";

export async function openFileInPlayer(filePath: string) {
  const { mediaPlayer } = useSettingsStore.getState();
  if (mediaPlayer === "default") {
    await openPath(filePath);
  } else {
    await invoke("open_in_player", {
      playerPath: mediaPlayer,
      filePath,
    });
  }
}
