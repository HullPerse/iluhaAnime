import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  Link2,
  MessageSquare,
  RefreshCw,
  Rss,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { torrentApi } from "@/api/torrent.api";
import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { useCell } from "@/lib/state/signal.hook";
import { buildTorrentView } from "@/lib/torrent/details.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { Source, TorrentDetailsProps as Props } from "@/types/search";
import type { Anime, TorrentDetails, TorrentDetailField, TorrentView } from "@/types/torrent";

import DescriptionBlocks from "./description.details";
import DetailsHero from "./hero.details";
import {
  CommentsPanel,
  DetailsTab,
  DetailsTabBar,
  FilesPanel,
  MediainfoPanel,
  ScreenshotsPanel,
} from "./panels.details";
import { DetailSection } from "./section.details";

const KNOWN_FIELD_LABELS = [
  "size",
  "размер",
  "seeder",
  "leecher",
  "category",
  "категория",
  "uploaded",
  "added",
  "updated",
  "hash",
  "хеш",
  "completed",
];

function isExtraMetadataField(field: TorrentDetailField): boolean {
  const label = field.label.toLowerCase();
  return !KNOWN_FIELD_LABELS.some((known) => label.includes(known));
}

function buildDetailTabs(
  view: TorrentView,
  t: (key: TranslationKey) => string
): { id: DetailsTab; label: string; count?: number }[] {
  const tabs: { id: DetailsTab; label: string; count?: number }[] = [
    { id: "description", label: t("search.details.description") },
  ];
  if (view.screenshots.length > 0) {
    tabs.push({
      id: "screenshots",
      label: t("search.details.screenshots"),
      count: view.screenshots.length,
    });
  }
  if (view.files.length > 0) {
    tabs.push({ id: "files", label: t("search.details.files"), count: view.files.length });
  }
  if (view.mediainfo) {
    tabs.push({ id: "mediainfo", label: t("search.details.mediainfo") });
  }
  tabs.push({
    id: "comments",
    label: t("search.details.comments"),
    count: view.comments.length,
  });
  return tabs;
}

function resolveActiveTab(
  tabs: { id: DetailsTab; label: string; count?: number }[],
  tab: DetailsTab
): DetailsTab {
  if (tabs.some((entry) => entry.id === tab)) return tab;
  return tabs[0]?.id ?? "description";
}

async function openOriginalUrl(
  source: Source,
  item: Anime,
  view: TorrentView | null,
  detailUrl: string
): Promise<void> {
  const originalUrl = (source === "erai-raws" && item.website) || view?.url || detailUrl;
  if (source === "erai-raws" && item.website) {
    const [, pageError] = await attempt(torrentApi.eraiOpenPage(item.website));
    if (!pageError) return;
    if (!String(pageError).includes("webview_not_found")) {
      reportBackgroundError("erai.open-page", pageError);
      return;
    }
    const [, loginError] = await attempt(torrentApi.eraiWebviewLogin());
    if (loginError) {
      reportBackgroundError("erai.open-page", loginError);
      return;
    }
    const [, retryError] = await attempt(torrentApi.eraiOpenPage(item.website));
    if (retryError) reportBackgroundError("erai.open-page", retryError);
    return;
  }
  const [, openError] = await attempt(openUrl(originalUrl));
  if (openError) reportBackgroundError("details.open-original", openError);
}

function DetailsLoading() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2">
      <SmallLoader size={6} />
      <span className="windows95-text">{t("search.details.loading")}</span>
    </div>
  );
}

function DetailsError({
  error,
  onRetry,
  onOpenOriginal,
}: {
  error: string;
  onRetry: () => void;
  onOpenOriginal: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="text-destructive flex min-h-36 flex-col items-center justify-center gap-2">
      <AlertCircle className="size-7" />
      <span className="windows95-text max-w-2xl text-center whitespace-pre-wrap">{error}</span>
      <div className="flex flex-wrap justify-center gap-1">
        <Button onClick={onRetry}>
          <RefreshCw className="mr-1 size-3" />
          {t("search.details.retry")}
        </Button>
        <Button onClick={onOpenOriginal}>
          <ExternalLink className="mr-1 size-3" />
          {t("search.details.original")}
        </Button>
      </div>
    </div>
  );
}

function DetailsLightbox({ url }: { url: string }) {
  const { t } = useI18n();
  const openImage = async () => {
    const [, openError] = await attempt(openUrl(url));
    if (openError) reportBackgroundError("details.open-image", openError);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex justify-end">
        <Button onClick={() => openImage()}>
          <ExternalLink className="size-3" />
          {t("search.details.open.image")}
        </Button>
      </div>
      <div className="windows95-border h-[62vh] overflow-auto bg-black/20">
        <ImageComponent key={url} src={url} alt="" className="h-full w-full" type="contain" />
      </div>
    </div>
  );
}

function DetailsTabPanels({
  view,
  activeTab,
  metadataFields,
  onZoom,
}: {
  view: TorrentView;
  activeTab: DetailsTab;
  metadataFields: TorrentDetailField[];
  onZoom: (url: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {activeTab === "description" && (
        <DetailSection
          icon={<Rss className="size-3" />}
          title={t("search.details.description")}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <DescriptionBlocks
            blocks={view.descriptionBlocks}
            fallback={view.description}
            onZoom={onZoom}
          />
        </DetailSection>
      )}

      {metadataFields.length > 0 && activeTab === "description" && (
        <DetailSection
          icon={<Info className="size-3" />}
          title={t("search.details.information")}
          count={metadataFields.length}
        >
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            {metadataFields.map((field, index) => (
              <div
                key={`${field.label}-${index}`}
                className="windows95-border bg-surface min-w-0 px-1.5 py-1"
              >
                <div className="windows95-text text-hint text-xs">{field.label}</div>
                <div className="windows95-text mt-0.5 text-xs wrap-break-word whitespace-pre-wrap">
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {activeTab === "screenshots" && (
        <DetailSection
          icon={<ImageIcon className="size-3" />}
          title={t("search.details.screenshots")}
          count={view.screenshots.length}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <ScreenshotsPanel screenshots={view.screenshots} onZoom={onZoom} />
        </DetailSection>
      )}

      {activeTab === "files" && (
        <DetailSection
          icon={<FileText className="size-3" />}
          title={t("search.details.files")}
          count={view.files.length}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <FilesPanel view={view} />
        </DetailSection>
      )}

      {activeTab === "mediainfo" && view.mediainfo && (
        <DetailSection
          icon={<Info className="size-3" />}
          title={t("search.details.mediainfo")}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <MediainfoPanel mediainfo={view.mediainfo} />
        </DetailSection>
      )}

      {activeTab === "comments" && (
        <DetailSection
          icon={<MessageSquare className="size-3" />}
          title={t("search.details.comments")}
          count={view.comments.length}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <CommentsPanel view={view} />
        </DetailSection>
      )}

      {view.infoHash && (
        <DetailSection icon={<Link2 className="size-3" />} title={t("search.details.hash")}>
          <p className="windows95-text text-xs break-all">{view.infoHash}</p>
        </DetailSection>
      )}
    </>
  );
}

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
  const sourceProxy = useCell(settingsAtoms.searchProxyUrls)[source] ?? "";
  const [info, setInfo] = useState<TorrentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<DetailsTab>("description");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const detailUrl = item.link;

  useEffect(() => {
    if (retry < 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);
    (async () => {
      const [result, error] = await attempt(
        torrentApi.getTorrentDetails(source, detailUrl, sourceProxy || undefined)
      );
      if (cancelled) return;
      if (error) setError(error.message);
      else setInfo(result);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [detailUrl, source, sourceProxy, retry]);

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
  const tabs = useMemo(() => (view ? buildDetailTabs(view, t) : []), [t, view]);
  const activeTab = resolveActiveTab(tabs, tab);
  const busy = loadingMagnet[item.link] ?? false;
  const poster = view?.poster ?? view?.screenshots[0] ?? null;
  const openOriginal = () => {
    ignore(openOriginalUrl(source, item, view, detailUrl));
  };

  return (
    <Modal
      header={lightbox ? t("search.details.screenshots") : view?.title || item.title}
      onClose={onClose}
      onBack={lightbox ? () => setLightbox(null) : undefined}
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
          onRetry={() => setRetry((value) => value + 1)}
          onOpenOriginal={openOriginal}
        />
      )}

      {lightbox ? (
        <DetailsLightbox url={lightbox} />
      ) : (
        view &&
        !loading && (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <DetailsHero
              view={view}
              item={actionItem}
              source={source}
              busy={busy}
              poster={poster}
              onCopyMagnet={onCopyMagnet}
              onOpenMagnet={onOpenMagnet}
              onDownload={onDownload}
              onOpenOriginal={openOriginal}
              onZoom={setLightbox}
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
              onZoom={setLightbox}
            />
          </div>
        )
      )}
    </Modal>
  );
}

export default TorrentDetailsModal;
