import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";

import { torrentApi } from "@/api/torrent.api";
import { tr } from "@/lib/locale/i18n.utils";
import { inflightFetch } from "@/lib/utils/lruCache.utils";
import { attemptResult, err, ok, type Result } from "@/lib/utils/result.utils";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import type { Anime } from "@/types/torrent";

const magnetInflight = new Map<string, Promise<Result<string>>>();

async function resolveMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
): Promise<Result<string>> {
  const key = item.link;
  if (item.magnet) return ok(item.magnet);
  const cached = magnets[key];
  if (cached) return ok(cached);

  return inflightFetch(magnetInflight, key, async () => {
    setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
    const fetched = await attemptResult(torrentApi.rutrackerGetMagnet(item.category));
    setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
    if (!fetched.ok) {
      useNotificationStore.getState().add(tr("common.error"), "error", tr("magnet.error"));
      return fetched;
    }
    setMagnets((prev) => ({ ...prev, [key]: fetched.value }));
    return fetched;
  });
}

export async function copyMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
) {
  const magnet = await resolveMagnet(item, magnets, setMagnets, setLoadingMagnet);
  if (magnet.ok) writeText(magnet.value);
}

export async function openMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
) {
  const magnet = await resolveMagnet(item, magnets, setMagnets, setLoadingMagnet);
  if (!magnet.ok) return;
  const opened = await attemptResult(openUrl(magnet.value));
  if (!opened.ok) {
    useNotificationStore.getState().add(tr("common.error"), "error", tr("magnet.open.error"));
  }
}

async function fetchTorrentBytes(
  item: Anime,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  source?: string
): Promise<Result<number[]>> {
  const key = item.link;
  setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
  const remote = item.torrent.startsWith("http");
  const fetched = await attemptResult(
    remote
      ? torrentApi.fetchTorrentBytes(item.torrent, source)
      : torrentApi.rutrackerGetTorrentBytes(item.category)
  );
  setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
  if (!fetched.ok) return fetched;
  return fetched.value.length === 0 ? err("torrent source returned no bytes") : fetched;
}

export async function downloadMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  source?: string
) {
  const bytes = await fetchTorrentBytes(item, setLoadingMagnet, source);
  if (bytes.ok) {
    await useTorrentStore.getState().prepareTorrentDownloadFromBytes(bytes.value, {
      seeders: item.seeders,
    });
    return;
  }
  const magnet = await resolveMagnet(item, magnets, setMagnets, setLoadingMagnet);
  if (magnet.ok)
    await useTorrentStore.getState().prepareTorrentDownload(magnet.value, {
      seeders: item.seeders,
    });
}
