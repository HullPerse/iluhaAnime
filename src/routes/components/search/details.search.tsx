import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  MessageSquare,
  RefreshCw,
  Rss,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/i18n";
import { formatSize } from "@/lib/index.utils";
import type { Anime, Source, TorrentDetails } from "@/types";

interface Props {
  item: Anime;
  source: Source;
  magnets: Record<string, string>;
  loadingMagnet: Record<string, boolean>;
  onClose: () => void;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
}

function DetailSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="windows95-border bg-white">
      <header className="bg-secondary flex items-center gap-1 px-1 py-0.5 text-white">
        {icon}
        <span className="windows95-font text-xs font-bold">{title}</span>
        {typeof count === "number" && (
          <span className="windows95-font ml-auto text-xs text-white/70">
            {count}
          </span>
        )}
      </header>
      <div className="p-1.5">{children}</div>
    </section>
  );
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="windows95-border bg-surface min-w-0 px-1.5 py-1">
      <div className="windows95-text text-muted text-xs">{label}</div>
      <div className="windows95-text mt-0.5 text-xs wrap-break-word">
        {value}
      </div>
    </div>
  );
}

function nonEmpty(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
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
  const [details, setDetails] = useState<TorrentDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  // Keep torrent metadata on the indexer page. Erai-Raws' separate website
  // link is used only for the original release page, which may require login.
  const detailUrl = item.link;

  useEffect(() => {
    if (retry < 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);

    invoke<TorrentDetails>("get_torrent_details", {
      source,
      url: detailUrl,
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
  }, [detailUrl, source, retry]);

  const view = useMemo(() => {
    if (!details) return null;
    const shellTitle =
      source === "nekobt" && /^(home|neko\s*bt)$/i.test(details.title);
    return {
      ...details,
      title: shellTitle ? item.title : nonEmpty(details.title, item.title),
      description: details.description?.trim() ?? "",
      category: nonEmpty(details.category, item.category),
      size: nonEmpty(details.size, item.size),
      seeders: details.seeders || item.seeders,
      leechers: details.leechers || item.leechers,
      magnet: nonEmpty(details.magnet, magnets[item.link] || item.magnet),
      torrentUrl: nonEmpty(details.torrentUrl, item.torrent),
      fields: Array.isArray(details.fields) ? details.fields : [],
      files: Array.isArray(details.files) ? details.files : [],
      screenshots: Array.isArray(details.screenshots)
        ? details.screenshots
        : [],
      comments: Array.isArray(details.comments) ? details.comments : [],
    };
  }, [details, item, magnets, source]);

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
    const originalUrl =
      (source === "erai-raws" && item.website) || view?.url || detailUrl;
    try {
      if (source === "erai-raws" && item.website) {
        try {
          await invoke("erai_open_page", { pageUrl: item.website });
          return;
        } catch {
          // Fall back to the system browser if the in-app window is unavailable.
        }
      }
      await openUrl(originalUrl);
    } catch {}
  };

  const metadataFields = view?.fields.filter((field) => {
    const label = field.label.toLowerCase();
    return ![
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
    ].some((known) => label.includes(known));
  });

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
          <span className="windows95-text text-muted text-xs">
            {t("search.details.cleaned")}
          </span>
        </div>
      )}

      {error && !loading && (
        <div className="text-destructive flex min-h-36 flex-col items-center justify-center gap-2">
          <AlertCircle className="size-7" />
          <span className="windows95-text max-w-2xl text-center whitespace-pre-wrap">
            {error}
          </span>
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
        <div className="flex min-w-0 flex-col gap-2">
          <div className="windows95-border bg-surface p-1.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="windows95-text font-bold wrap-break-word">
                  {view.title}
                </h2>
                <p className="windows95-text text-muted mt-1 text-xs break-all">
                  {source} - {view.url || item.link}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <Button
                  onClick={() => openOriginal()}
                  title={t("search.details.openSource")}
                >
                  <ExternalLink className="mr-1 size-3" />
                  {t("search.details.original")}
                </Button>
                {(actionItem.magnet || source === "rutracker") && (
                  <>
                    <Button
                      onClick={() => onCopyMagnet(actionItem)}
                      disabled={loadingMagnet[item.link]}
                    >
                      {t("search.details.copy")}
                    </Button>
                    <Button
                      onClick={() => onOpenMagnet(actionItem)}
                      disabled={loadingMagnet[item.link]}
                    >
                      {t("search.details.magnet")}
                    </Button>
                    <Button
                      onClick={() => onDownload(actionItem)}
                      disabled={loadingMagnet[item.link]}
                    >
                      {t("search.details.download")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {view.notice && (
            <div className="windows95-border flex items-start gap-1 bg-yellow-100 p-1 text-xs text-black">
              <Info className="mt-0.5 size-3 shrink-0" />
              <span className="windows95-text whitespace-pre-wrap">
                {view.notice}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-7">
            <MetaItem
              label={t("search.details.size")}
              value={formatSize(view.size) || "-"}
            />
            <MetaItem
              label={t("search.details.seeders")}
              value={<span className="text-success">{view.seeders}</span>}
            />
            <MetaItem
              label={t("search.details.leechers")}
              value={<span className="text-destructive">{view.leechers}</span>}
            />
            {source === "rutracker" ? (
              <MetaItem
                label={t("search.details.downloads")}
                value={
                  view.downloads > 0 ? view.downloads.toLocaleString() : "-"
                }
              />
            ) : (
              <MetaItem
                label={t("search.details.completed")}
                value={view.completed}
              />
            )}
            <MetaItem
              label={t("search.details.category")}
              value={view.category || "-"}
            />
            <MetaItem
              label={t("search.details.added")}
              value={view.uploadedAt || "-"}
            />
            <MetaItem
              label={t("search.details.updated")}
              value={view.updatedAt || "-"}
            />
          </div>

          <DetailSection
            icon={<Rss className="size-3" />}
            title={t("search.details.description")}
          >
            <p className="windows95-text max-h-64 overflow-y-auto text-xs wrap-break-word whitespace-pre-wrap">
              {view.description || t("search.details.noDescription")}
            </p>
          </DetailSection>

          {metadataFields && metadataFields.length > 0 && (
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
                    <div className="windows95-text text-muted text-xs">
                      {field.label}
                    </div>
                    <div className="windows95-text mt-0.5 text-xs wrap-break-word whitespace-pre-wrap">
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {view.infoHash && (
            <DetailSection
              icon={<Info className="size-3" />}
              title={t("search.details.hash")}
            >
              <p className="windows95-text text-xs break-all">
                {view.infoHash}
              </p>
            </DetailSection>
          )}

          {view.screenshots.length > 0 && (
            <DetailSection
              icon={<ImageIcon className="size-3" />}
              title={t("search.details.screenshots")}
              count={view.screenshots.length}
            >
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {view.screenshots.map((url, index) => (
                  <button
                    type="button"
                    key={`${url}-${index}`}
                    className="windows95-border aspect-video min-h-28 cursor-pointer bg-black/20 transition-[filter] hover:brightness-110"
                    onClick={() => openUrl(url).catch(() => {})}
                    title={t("search.details.openImage")}
                  >
                    <ImageComponent
                      src={url}
                      alt={`${t("search.details.screenshots")} ${index + 1}`}
                      className="h-full w-full"
                      type="contain"
                    />
                  </button>
                ))}
              </div>
            </DetailSection>
          )}

          {view.files.length > 0 && (
            <DetailSection
              icon={<FileText className="size-3" />}
              title={t("search.details.files")}
              count={view.files.length}
            >
              <div className="grid max-h-72 grid-cols-1 gap-x-2 overflow-y-auto sm:grid-cols-2">
                {view.files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex min-w-0 gap-2 border-b border-black/10 px-1 py-0.5"
                  >
                    <span
                      className="windows95-text min-w-0 flex-1 truncate text-xs"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    <span className="windows95-text text-muted shrink-0 text-xs">
                      {file.size || "-"}
                    </span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          <DetailSection
            icon={<MessageSquare className="size-3" />}
            title={t("search.details.comments")}
            count={view.comments.length}
          >
            {view.comments.length === 0 ? (
              <span className="windows95-text text-muted text-xs">
                {t("search.details.noComments")}
              </span>
            ) : (
              <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto lg:grid-cols-2">
                {view.comments.map((comment, index) => (
                  <article
                    key={`${comment.author}-${comment.date}-${index}`}
                    className="windows95-border bg-surface min-w-0 p-1"
                  >
                    <div className="windows95-text flex justify-between gap-2 text-xs">
                      <strong className="truncate">
                        {comment.author || t("search.details.anonymous")}
                      </strong>
                      <span className="text-muted shrink-0">
                        {comment.date}
                      </span>
                    </div>
                    <p className="windows95-text mt-1 text-xs wrap-break-word whitespace-pre-wrap">
                      {comment.text}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </DetailSection>
        </div>
      )}
    </Modal>
  );
}

export default TorrentDetailsModal;