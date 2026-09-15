import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";

import { attempt } from "@/lib/utils/attempt.utils";

export async function installUpdate(update: Update) {
  if (!update) return;
  await update.downloadAndInstall();
}

export async function checkForUpdates(): Promise<Update | null> {
  const [update, error] = await attempt(check());
  if (error !== null) {
    console.error(error);
    return null;
  }
  return update;
}
