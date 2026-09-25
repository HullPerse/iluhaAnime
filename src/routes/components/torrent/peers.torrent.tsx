import { useQuery } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Link } from "lucide-react";
import { useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { FlagIcon } from "@/components/shared/flag.component";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import Tabs from "@/components/shared/tabs.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { buildTorrentLink } from "@/lib/utils/deeplink.utils";
import { showError } from "@/lib/utils/notification.utils";

import { TorrentTrackersBlock } from "./sections/trackers.sections";

function splitAddr(addr: string): { host: string; port: string } {
  const closingBracket = addr.lastIndexOf("]");
  if (addr.startsWith("[") && closingBracket > 0) {
    return { host: addr.slice(0, closingBracket + 1), port: addr.slice(closingBracket + 2) };
  }
  const at = addr.lastIndexOf(":");
  if (at === -1) return { host: addr, port: "" };
  return { host: addr.slice(0, at), port: addr.slice(at + 1) };
}

export function TorrentPeersModal({
  id,
  infoHash,
  open,
  onClose,
}: {
  id: number;
  infoHash: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"peers" | "trackers">("peers");
  const query = useQuery({
    queryKey: ["torrent_diagnostics", id],
    queryFn: () => torrentApi.getTorrentDiagnostics(id, infoHash),
    enabled: open,
    refetchInterval: 5000,
    staleTime: 4000,
  });
  if (!open) return null;
  const copyText = (label: string, value: string) => {
    (async () => {
      const [, error] = await attempt(writeText(value));
      if (error) showError(label, error.message);
    })();
  };
  const peers = query.data?.peers ?? [];
  const trackers = query.data?.trackers ?? [];
  const copies = [
    {
      icon: Copy,
      label: t("torrent.copy.magnet"),
      value: `magnet:?xt=urn:btih:${infoHash}`,
    },
    { icon: Copy, label: t("torrent.copy.infohash"), value: infoHash },
    { icon: Link, label: t("torrent.copy.link"), value: buildTorrentLink(infoHash) },
  ];
  return (
    <Modal header={t("torrent.peers.title")} onClose={onClose} className="w-2xl">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1">
          {copies.map((copy) => (
            <Button
              key={copy.label}
              variant="secondary"
              title={copy.label}
              onClick={() => copyText(copy.label, copy.value)}
            >
              <copy.icon />
              {copy.label}
            </Button>
          ))}
        </div>
        <div className="shrink-0">
          <Tabs
            tabs={[
              { id: "peers", label: `${t("torrent.peers.title")} (${peers.length})` },
              {
                id: "trackers",
                label: `${t("torrent.diagnostics.trackers")} (${trackers.length})`,
              },
            ]}
            activeTab={tab}
            onChange={setTab}
          />
        </div>
        {query.isLoading && (
          <div className="flex items-center gap-1 px-0.5 py-0.5">
            <SmallLoader size={3} />
          </div>
        )}
        {query.isError && (
          <div className="text-hint windows95-text px-0.5 py-0.5 text-xs">
            {t("torrent.diagnostics.error")}
          </div>
        )}
        {query.data && tab === "peers" && (
          <div
            role="table"
            aria-label={t("torrent.peers.title")}
            className="windows95-text flex min-w-0 flex-col text-xs"
          >
            <div role="row" className="bg-primary sticky top-0 z-10 flex gap-2 py-0.5 font-bold">
              <span
                role="columnheader"
                aria-label={t("torrent.peers.country")}
                className="w-4 shrink-0"
                title={t("torrent.peers.country")}
              />
              <span role="columnheader" className="min-w-0 flex-1">
                {t("torrent.peers.address")}
              </span>
              <span role="columnheader" className="w-24 shrink-0">
                {t("torrent.peers.client")}
              </span>
              <span role="columnheader" className="w-10 shrink-0">
                {t("torrent.peers.connection")}
              </span>
              <span role="columnheader" className="w-16 shrink-0 text-right">
                {t("torrent.peers.downloaded")}
              </span>
              <span role="columnheader" className="w-16 shrink-0 text-right">
                {t("torrent.peers.uploaded")}
              </span>
            </div>
            {peers.length === 0 && (
              <div role="row" className="text-hint py-0.5">
                <span role="cell">{t("torrent.diagnostics.empty")}</span>
              </div>
            )}
            {peers.map((peer) => {
              const { host, port } = splitAddr(peer.addr);
              return (
                <div
                  role="row"
                  key={peer.addr}
                  className="hover:bg-surface flex min-w-0 gap-2 py-0.5"
                  title={`${peer.addr} - ${peer.state}${peer.errors > 0 ? ` (E${peer.errors})` : ""}`}
                >
                  <span role="cell" className="flex w-4 shrink-0 items-center">
                    <FlagIcon code={peer.country} />
                  </span>
                  <span role="cell" className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="min-w-0 truncate">{port ? `${host}:${port}` : host}</span>
                    {peer.errors > 0 && (
                      <span
                        className="text-destructive shrink-0"
                        title={`${t("torrent.peers.errors")}: ${peer.errors}`}
                      >
                        E{peer.errors}
                      </span>
                    )}
                    <span className="text-hint shrink-0 truncate">{peer.state}</span>
                  </span>
                  <span role="cell" className="text-hint w-24 shrink-0 truncate">
                    {peer.client_name ?? "-"}
                  </span>
                  <span role="cell" className="text-hint w-10 shrink-0 truncate">
                    {peer.conn_kind ?? "-"}
                  </span>
                  <span role="cell" className="w-16 shrink-0 text-right tabular-nums">
                    {formatBytes(peer.down_bytes)}
                  </span>
                  <span role="cell" className="w-16 shrink-0 text-right tabular-nums">
                    {formatBytes(peer.up_bytes)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {query.data && tab === "trackers" && (
          <TorrentTrackersBlock id={id} infoHash={infoHash} trackers={trackers} />
        )}
      </div>
    </Modal>
  );
}
