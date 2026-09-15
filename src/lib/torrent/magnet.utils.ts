import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";

import { translate } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime } from "@/types/torrent";

async function ensureMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
): Promise<string | null> {
  const key = item.link;
  if (magnets[key]) return magnets[key];

  setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
  const rutrackerProxy = useSettingsStore.getState().searchProxyUrls["rutracker"];
  const [magnet, error] = await attempt(
    invokeTyped<string>("rutracker_get_magnet", {
      topicId: item.category,
      proxyUrl: rutrackerProxy || undefined,
      proxy_url: rutrackerProxy || undefined,
    })
  );
  setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
  if (error !== null) {
    const language = useSettingsStore.getState().language;
    useNotificationStore
      .getState()
      .add(translate(language, "common.error"), "error", translate(language, "magnet.error"));
    return null;
  }
  setMagnets((prev) => ({ ...prev, [key]: magnet }));
  return magnet;
}

export async function copyMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
) {
  const magnet = item.magnet || (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) writeText(magnet);
}

export async function openMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void
) {
  const magnet = item.magnet || (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) {
    const [, error] = await attempt(openUrl(magnet));
    if (error) {
      useNotificationStore
        .getState()
        .add(
          translate(useSettingsStore.getState().language, "common.error"),
          "error",
          translate(useSettingsStore.getState().language, "magnet.open.error")
        );
    }
  }
}

async function fetchTorrentBytes(
  item: Anime,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  source?: string
): Promise<number[] | null> {
  const key = item.link;
  setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
  const proxies = useSettingsStore.getState().searchProxyUrls;
  const remote = item.torrent.startsWith("http");
  const proxy = remote ? (source ? proxies[source] : undefined) : proxies["rutracker"];
  const [bytes, error] = await attempt(
    remote
      ? invokeTyped<number[]>("fetch_torrent_bytes", {
          url: item.torrent,
          proxyUrl: proxy || undefined,
          proxy_url: proxy || undefined,
        })
      : invokeTyped<number[]>("rutracker_get_torrent_bytes", {
          topicId: item.category,
          proxyUrl: proxy || undefined,
          proxy_url: proxy || undefined,
        })
  );
  setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
  if (error !== null || bytes === null || bytes.length === 0) return null;
  return bytes;
}

export async function downloadMagnet(
  item: Anime,
  magnets: Record<string, string>,
  setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => void,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  source?: string
) {
  const bytes = await fetchTorrentBytes(item, setLoadingMagnet, source);
  if (bytes) {
    await useTorrentStore.getState().prepareTorrentDownloadFromBytes(bytes);
    return;
  }
  const magnet = item.magnet || (await ensureMagnet(item, magnets, setMagnets, setLoadingMagnet));
  if (magnet) await useTorrentStore.getState().prepareTorrentDownload(magnet);
}
