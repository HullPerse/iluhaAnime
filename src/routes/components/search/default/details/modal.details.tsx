import { ExternalLink, Info } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import Modal from "@/components/shared/modal.component";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useTorrentCover } from "@/hooks/search/cover.hook";
import { ignore } from "@/lib/core/promise.utils";
import { useCell } from "@/lib/core/signal.hook";
import { buildTorrentView } from "@/lib/torrent/torrentDetails.utils";
import {
  buildDetailTabs,
  detailsErrorText,
  heroPoster,
  isExtraMetadataField,
  lightboxImage,
  lightboxPager,
  openDetailsOriginalUrl,
  resolveActiveTab,
} from "@/lib/torrent/torrentDetailsModal.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { ImageLightbox } from "@/types/core/detailsModal";
import type { DetailsTab } from "@/types/core/panels.details";
import type { TorrentDetailsProps as Props } from "@/types/search/search";
import type { Anime } from "@/types/torrent/torrent";

import Hero from "@/routes/components/search/default/details/hero.details";
import { DetailsError } from "@/routes/components/search/default/details/modal/error.modal";
import { DetailsLightbox } from "@/routes/components/search/default/details/modal/lightbox.modal";
import { DetailsLoading } from "@/routes/components/search/default/details/modal/loading.modal";
import { DetailsTabPanels } from "@/routes/components/search/default/details/modal/tabPanels.modal";
import { DetailsTabBar } from "@/routes/components/search/default/details/panels/tabBar.panels";

export default function TorrentDetailsModal({
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
  const sourceProxy = useCell(settingsAtoms.searchProxyUrls)[source] ?? "";
  const [tab, setTab] = useState<DetailsTab>("description");
  const [lightbox, setLightbox] = useState<ImageLightbox | null>(null);

  const detailUrl = item.link;

  const detailsQuery = useAppQuery("slow", {
    queryKey: queryKeys.torrentDetails(source, detailUrl, sourceProxy),
    queryFn: () => torrentApi.getTorrentDetails(source, detailUrl, sourceProxy || undefined),
  });
  const info = detailsQuery.data ?? null;
  const loading = detailsQuery.isLoading;
  const error = detailsErrorText(detailsQuery.error);

  const view = useMemo(
    () => (info ? buildTorrentView(info, item, magnets, source) : null),
    [info, item, magnets, source]
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

  const metadataFields = useMemo(() => (view?.fields ?? []).filter(isExtraMetadataField), [view]);
  const descriptionImages = useMemo(
    () =>
      (view?.descriptionBlocks ?? [])
        .filter((block) => block.kind === "image")
        .map((block) => block.src),
    [view]
  );
  const openZoom = useCallback((images: string[], url: string) => {
    const index = images.indexOf(url);
    setLightbox({ images, index: Math.max(0, index) });
  }, []);
  const tabs = useMemo(() => (view ? buildDetailTabs(view, t) : []), [t, view]);
  const activeTab = resolveActiveTab(tabs, tab);
  const busy = loadingMagnet[item.link] ?? false;
  const coverMode = useCell(settingsAtoms.torrentCoverMode);
  const cover = useTorrentCover(item.title, { source, url: detailUrl, mode: coverMode });
  const poster = coverMode === "off" ? null : heroPoster(view, cover.coverUrl, cover.remoteUrl);
  const hidePoster = coverMode === "off" || (coverMode === "pages" && poster === null);
  const openOriginal = () => {
    ignore(openDetailsOriginalUrl(source, item, view, detailUrl));
  };

  return (
    <Modal
      header={lightbox ? t("common.images") : view?.title || item.title}
      onClose={onClose}
      onBack={lightbox ? () => setLightbox(null) : undefined}
      pager={lightboxPager(lightbox, t("common.images"), setLightbox)}
      headerActions={
        <button
          type="button"
          onClick={() => openOriginal()}
          title={t("search.details.open.source")}
          aria-label={t("search.details.open.source")}
          className="windows95-active-border bg-primary text-text windows95-text flex size-5 cursor-pointer items-center justify-center hover:brightness-110 active:translate-x-px active:translate-y-px"
        >
          <ExternalLink className="size-2.5" />
        </button>
      }
      className="h-[92vh] w-[min(78rem,calc(100vw-1rem))]"
      contentClassName="gap-2 p-2"
    >
      {loading && <DetailsLoading />}

      {error && !loading && (
        <DetailsError
          error={error}
          onRetry={() => detailsQuery.refetch()}
          onOpenOriginal={openOriginal}
        />
      )}

      {lightbox ? (
        <DetailsLightbox url={lightboxImage(lightbox)} />
      ) : (
        view &&
        !loading && (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Hero
              view={view}
              item={actionItem}
              source={source}
              busy={busy}
              poster={poster}
              hidePoster={hidePoster}
              onCopyMagnet={onCopyMagnet}
              onOpenMagnet={onOpenMagnet}
              onDownload={onDownload}
              onOpenOriginal={openOriginal}
              onZoom={(url) => openZoom([url], url)}
            />

            {view.notice && (
              <div className="windows95-border flex items-start gap-1 bg-yellow-100 p-1 text-xs text-black">
                <Info className="mt-0.5 size-3 shrink-0" />
                <span className="windows95-text whitespace-pre-wrap">{view.notice}</span>
              </div>
            )}

            <DetailsTabBar tabs={tabs} activeTab={activeTab} title={view.title} onSelect={setTab} />

            <DetailsTabPanels
              view={view}
              activeTab={activeTab}
              metadataFields={metadataFields}
              onZoom={(url) => openZoom(descriptionImages, url)}
              onZoomScreenshot={(url) => openZoom(view.screenshots, url)}
            />
          </div>
        )
      )}
    </Modal>
  );
}
