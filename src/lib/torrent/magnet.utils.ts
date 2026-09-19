import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";

import { translate } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { attemptResult, err, ok, type Result } from "@/lib/utils/result.utils";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime } from "@/types/torrent";

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

  setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
  const rutrackerProxy = useSettingsStore.getState().searchProxyUrls["rutracker"];
  const fetched = await attemptResult(
    invokeTyped<string>("rutracker_get_magnet", {
      topicId: item.category,
      proxyUrl: rutrackerProxy || undefined,
      proxy_url: rutrackerProxy || undefined,
    })
  );
  setLoadingMagnet((prev) => ({ ...prev, [key]: false }));
  if (!fetched.ok) {
    const language = useSettingsStore.getState().language;
    useNotificationStore
      .getState()
      .add(translate(language, "common.error"), "error", translate(language, "magnet.error"));
    return fetched;
  }
  setMagnets((prev) => ({ ...prev, [key]: fetched.value }));
  return fetched;
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
    useNotificationStore
      .getState()
      .add(
        translate(useSettingsStore.getState().language, "common.error"),
        "error",
        translate(useSettingsStore.getState().language, "magnet.open.error")
      );
  }
}

async function fetchTorrentBytes(
  item: Anime,
  setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  source?: string
): Promise<Result<number[]>> {
  const key = item.link;
  setLoadingMagnet((prev) => ({ ...prev, [key]: true }));
  const proxies = useSettingsStore.getState().searchProxyUrls;
  const remote = item.torrent.startsWith("http");
  const proxy = remote ? (source ? proxies[source] : undefined) : proxies["rutracker"];
  const fetched = await attemptResult(
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
    await useTorrentStore.getState().prepareTorrentDownloadFromBytes(bytes.value);
    return;
  }
  const magnet = await resolveMagnet(item, magnets, setMagnets, setLoadingMagnet);
  if (magnet.ok) await useTorrentStore.getState().prepareTorrentDownload(magnet.value);
}
