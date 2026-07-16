import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { showToast } from "./toast.utils";
import type { Anime } from "@/types";
import { useTorrentStore } from "@/store/download.store";

async function ensureMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
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
    showToast("Не удалось получить магнит-ссылку", "error");
    return null;
  } finally {
    setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
  }
}

export async function copyMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
) {
  const magnet = item.magnet || (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) writeText(magnet);
}

export async function openMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
) {
  const magnet = item.magnet || (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) {
    try {
      await openUrl(magnet);
    } catch {}
  }
}

export async function downloadMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
) {
  const magnet = item.magnet || (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) useTorrentStore.getState().prepareTorrentDownload(magnet);
}
