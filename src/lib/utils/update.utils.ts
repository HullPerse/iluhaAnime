import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";

import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";

export async function installUpdate(update: Update) {
  if (!update) return;
  await update.downloadAndInstall();
}

export async function checkForUpdates(): Promise<Update | null> {
  const [update, error] = await attempt(check());
  if (error !== null) {
    reportBackgroundError("updates.check", error);
    return null;
  }
  return update;
}
