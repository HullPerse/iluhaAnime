import { open } from "@tauri-apps/plugin-dialog";

import { torrentApi } from "@/api/torrent.api";
import { tr } from "@/lib/locale/i18n.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { showError } from "@/lib/core/ui/notification.utils";

export function hasConflictingSelection(
  pending: { files: { index: number; name: string }[]; conflictingFiles: string[] },
  selectedIndices: number[]
): boolean {
  return selectedIndices.some((index) => {
    const file = pending.files.find((entry) => entry.index === index);
    return Boolean(file && pending.conflictingFiles.includes(file.name));
  });
}

export function requiredBytesForSelection(
  pending: {
    files: { index: number; name: string; size: number }[];
    conflictingFiles: string[];
  },
  selectedIndices: number[]
): number {
  return selectedIndices.reduce((sum, index) => {
    const file = pending.files.find((entry) => entry.index === index);
    if (!file) return sum;
    const existing = pending.conflictingFiles.includes(file.name) ? file.size : 0;
    return sum + file.size + existing;
  }, 0);
}

export function resolveOnlyFiles(
  allFiles: { index: number }[],
  selected: number[]
): number[] | null {
  return selected.length === allFiles.length ? null : selected;
}

export async function pickSaveDir(): Promise<string | null> {
  const dir = await open({
    directory: true,
    title: tr("download.select.folder"),
  });
  return dir || null;
}

export async function startDownloadForPending(
  pending: { magnet?: string; fileBytes?: number[] },
  saveDir: string,
  onlyFiles: number[] | null,
  subFolder: string | undefined,
  sequential: boolean,
  requiredBytes: number
): Promise<number | undefined> {
  if (!pending.magnet && !pending.fileBytes) return undefined;
  const [id, error] = await attempt(
    torrentApi.startTorrentDownload({
      magnet: pending.magnet,
      fileBytes: pending.fileBytes,
      saveDir,
      onlyFiles,
      subFolder: subFolder || null,
      sequential,
      requiredBytes,
    })
  );
  if (error) {
    showError(tr("download.error.start"), error.message);
    return undefined;
  }
  return id;
}

export async function clearPreviousTorrentIfNeeded(id: number | undefined): Promise<void> {
  if (!id) return;
  const [, error] = await attempt(torrentApi.removeTorrent(id, false));
  if (error) showError(tr("download.error.clear"), error.message);
}
