import { openUrl } from "@tauri-apps/plugin-opener";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { buildTorrentView } from "@/lib/torrent/details.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { Anime, TorrentDetails } from "@/types/torrent";
import type { TorrentDetailsProps as Props } from "@/types/search";

import { TorrentDetailsBody } from "./body.details";

function TorrentDetailsModal({
  item,
  source,
  magnets,
  loadingMagnet,
  onClose,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
}: Props) {
  const { t } = useI18n();
  const sourceProxy = useSettingsStore((s) => s.searchProxyUrls[source] ?? "");
  const [details, setDetails] = useState<TorrentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  const detailUrl = item.link;

  useEffect(() => {
    if (retry < 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);

    invokeTyped<TorrentDetails>("get_torrent_details", {
      source,
      url: detailUrl,
      proxyUrl: sourceProxy || undefined,
      proxy_url: sourceProxy || undefined,
    })
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailUrl, source, sourceProxy, retry]);

  const view = useMemo(
    () => (details ? buildTorrentView(details, item, magnets, source) : null),
    [details, item, magnets, source]
  );

  const actionItem = useMemo<Anime>(
    () => ({
      ...item,
      title: view?.title || item.title,
      magnet: view?.magnet || item.magnet,
      torrent: view?.torrentUrl || item.torrent,
      size: view?.size || item.size,
      seeders: view?.seeders ?? item.seeders,
      leechers: view?.leechers ?? item.leechers,
      category: view?.category || item.category,
    }),
    [item, view]
  );

  const openOriginal = async () => {
    const originalUrl = (source === "erai-raws" && item.website) || view?.url || detailUrl;
    try {
      if (source === "erai-raws" && item.website) {
        try {
          await invokeTyped("erai_open_page", { pageUrl: item.website });
          return;
        } catch (error) {
          reportBackgroundError("erai.open-page", error);
        }
      }
      await openUrl(originalUrl);
    } catch (error) {
      console.warn("openUrl failed", error);
    }
  };

  return (
    <Modal
      header={view?.title || item.title}
      onClose={onClose}
      className="w-[min(78rem,calc(100vw-1rem))]"
      contentClassName="gap-2 p-2"
    >
      {loading && (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2">
          <SmallLoader size={6} />
          <span className="windows95-text">{t("search.details.loading")}</span>
        </div>
      )}

      {error && !loading && (
        <div className="text-destructive flex min-h-36 flex-col items-center justify-center gap-2">
          <AlertCircle className="size-7" />
          <span className="windows95-text max-w-2xl text-center whitespace-pre-wrap">{error}</span>
          <div className="flex flex-wrap justify-center gap-1">
            <Button onClick={() => setRetry((value) => value + 1)}>
              <RefreshCw className="mr-1 size-3" />
              {t("search.details.retry")}
            </Button>
            <Button onClick={() => openOriginal()}>
              <ExternalLink className="mr-1 size-3" />
              {t("search.details.original")}
            </Button>
          </div>
        </div>
      )}

      {view && !loading && (
        <TorrentDetailsBody
          view={view}
          item={item}
          source={source}
          actionItem={actionItem}
          loadingMagnet={loadingMagnet}
          onCopyMagnet={onCopyMagnet}
          onOpenMagnet={onOpenMagnet}
          onDownload={onDownload}
          openOriginal={openOriginal}
        />
      )}
    </Modal>
  );
}

export default TorrentDetailsModal;
