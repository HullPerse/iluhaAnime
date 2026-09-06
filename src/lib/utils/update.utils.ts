import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";

export async function installUpdate(update: Update) {
  if (!update) return;
  await update.downloadAndInstall();
}

export async function checkForUpdates(): Promise<Update | null> {
  try {
    return await check();
  } catch (error) {
    console.error(error);
    return null;
  }
}
