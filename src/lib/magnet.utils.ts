import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";

import { translate } from "@/lib/i18n";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime } from "@/types";

async function ensureMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (
    fn: (prev: Record<string, string>) => Record<string, string>
  ) => void,
  setLoadingMagnet: (
    fn: (prev: Record<string, boolean>) => Record<string, boolean>
  ) => void
): Promise<string | null> {
  const key = item.link;
  if (magnets[key]) return magnets[key];

  setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
  try {
    const magnet = await invoke<string>("rutracker_get_magnet", {
      topicId: item.category,
    });
    setMagnets((prev) => ({ ...prev, [key]: magnet }));
    return magnet;
  } catch {
    useNotificationStore
      .getState()
      .add(
        translate(useSettingsStore.getState().language, "common.error"),
        "error",
        translate(useSettingsStore.getState().language, "magnet.error")
      );
    return null;
  } finally {
    setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
  }
}

export async function copyMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (
    fn: (prev: Record<string, string>) => Record<string, string>
  ) => void,
  setLoadingMagnet: (
    fn: (prev: Record<string, boolean>) => Record<string, boolean>
  ) => void
) {
  const magnet =
    item.magnet ||
    (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) writeText(magnet);
}

export async function openMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (
    fn: (prev: Record<string, string>) => Record<string, string>
  ) => void,
  setLoadingMagnet: (
    fn: (prev: Record<string, boolean>) => Record<string, boolean>
  ) => void
) {
  const magnet =
    item.magnet ||
    (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) {
    try {
      await openUrl(magnet);
    } catch {}
  }
}

async function fetchTorrentBytes(
  item: Anime,
  setLoadingMagnet: (
    fn: (prev: Record<string, boolean>) => Record<string, boolean>
  ) => void
): Promise<number[] | null> {
  const key = item.link;
  setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
  try {
    // nyaa-style sources expose a direct .torrent URL; rutracker serves the
    // .torrent via dl.php. Either way the metadata comes embedded in the file,
    // so no DHT/peer round-trip is needed to resolve it.
    const bytes = item.torrent.startsWith("http")
      ? await invoke<number[]>("fetch_torrent_bytes", { url: item.torrent })
      : await invoke<number[]>("rutracker_get_torrent_bytes", {
          topicId: item.category,
        });
    return bytes && bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  } finally {
    setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
  }
}

export async function downloadMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (
    fn: (prev: Record<string, string>) => Record<string, string>
  ) => void,
  setLoadingMagnet: (
    fn: (prev: Record<string, boolean>) => Record<string, boolean>
  ) => void
) {
  const bytes = await fetchTorrentBytes(item, setLoadingMagnet);
  if (bytes) {
    await useTorrentStore.getState().prepareTorrentDownloadFromBytes(bytes);
    return;
  }
  const magnet =
    item.magnet ||
    (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) await useTorrentStore.getState().prepareTorrentDownload(magnet);
}
