import { useQuery } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import { SmallLoader } from "@/components/shared/loader.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import type { TorrentDiagnostics } from "@/types/torrent";

export function TorrentDiagnosticsSection({
  id,
  infoHash,
  enabled,
}: {
  id: number;
  infoHash: string;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const copyText = (label: string, value: string) => {
    writeText(value).catch((error: unknown) =>
      showError(label, error instanceof Error ? error.message : String(error))
    );
  };
  const query = useQuery({
    queryKey: ["torrent_diagnostics", id],
    queryFn: () =>
      invokeTyped<TorrentDiagnostics>("get_torrent_diagnostics", { id, info_hash: infoHash }),
    enabled,
    refetchInterval: 5000,
    staleTime: 4000,
  });
  if (!enabled) return null;
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-1 px-0.5 py-0.5">
        <SmallLoader size={3} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="text-hint windows95-text px-0.5 py-0.5 text-xs">
        {t("torrent.diagnostics.error")}
      </div>
    );
  }
  const { peers, trackers } = query.data;
  return (
    <div className="windows95-text flex flex-col gap-1 px-0.5 py-0.5 text-xs">
      <span className="font-bold">{t("torrent.diagnostics.title")}</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => copyText(t("torrent.copy.magnet"), `magnet:?xt=urn:btih:${infoHash}`)}
          title={t("torrent.copy.magnet")}
          className="windows95-text hover:bg-surface px-1 text-xs"
        >
          {t("torrent.copy.magnet")}
        </button>
        <button
          type="button"
          onClick={() => copyText(t("torrent.copy.infohash"), infoHash)}
          title={t("torrent.copy.infohash")}
          className="windows95-text hover:bg-surface px-1 text-xs"
        >
          {t("torrent.copy.infohash")}
        </button>
      </div>
      <span>
        {t("torrent.diagnostics.peers", { count: peers.length })}
        {peers.length === 0 ? ` - ${t("torrent.diagnostics.empty")}` : ""}
      </span>
      {peers.slice(0, 10).map((peer) => (
        <div key={peer.addr} className="flex gap-1 truncate" title={peer.addr}>
          <span className="min-w-0 flex-1 truncate">{peer.addr}</span>
          <span className="text-hint shrink-0">
            {peer.client_name ?? peer.state} - {formatBytes(peer.down_bytes)} /{" "}
            {formatBytes(peer.up_bytes)}
            {peer.errors > 0 ? ` (E${peer.errors})` : ""}
          </span>
        </div>
      ))}
      {trackers.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="font-bold">{t("torrent.diagnostics.trackers")}</span>
          {trackers.map((tracker) => (
            <span key={tracker} className="text-hint truncate" title={tracker}>
              {tracker}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
