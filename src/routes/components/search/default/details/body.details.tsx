import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, FileText, Image as ImageIcon, Info, MessageSquare, Rss } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatSize } from "@/lib/search/format.utils";
import type { Anime, TorrentView } from "@/types/torrent";
import type { Source } from "@/types/search";

import { MetaItem } from "./meta.details";
import { DetailSection } from "./section.details";

export function TorrentDetailsBody({
  view,
  item,
  source,
  actionItem,
  loadingMagnet,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
  openOriginal,
}: {
  view: TorrentView;
  item: Anime;
  source: Source;
  actionItem: Anime;
  loadingMagnet: Record<string, boolean>;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  openOriginal: () => Promise<void>;
}) {
  const { t } = useI18n();
  const metadataFields = view.fields.filter((field) => {
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
    <div className="flex min-w-0 flex-col gap-2">
      <div className="windows95-border bg-surface p-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="windows95-text font-bold wrap-break-word">{view.title}</h2>
            <p className="windows95-text text-hint mt-1 text-xs break-all">
              {source} - {view.url || item.link}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <Button onClick={() => openOriginal()} title={t("search.details.open.source")}>
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
                <Button onClick={() => onDownload(actionItem)} disabled={loadingMagnet[item.link]}>
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
          <span className="windows95-text whitespace-pre-wrap">{view.notice}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-7">
        <MetaItem label={t("search.details.size")} value={formatSize(view.size) || "-"} />
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
            value={view.downloads > 0 ? view.downloads.toLocaleString() : "-"}
          />
        ) : (
          <MetaItem label={t("search.details.completed")} value={view.completed} />
        )}
        <MetaItem label={t("search.details.category")} value={view.category || "-"} />
        <MetaItem label={t("search.details.added")} value={view.uploadedAt || "-"} />
        <MetaItem label={t("search.details.updated")} value={view.updatedAt || "-"} />
      </div>

      <DetailSection icon={<Rss className="size-3" />} title={t("search.details.description")}>
        <p className="windows95-text max-h-64 overflow-y-auto text-xs wrap-break-word whitespace-pre-wrap">
          {view.description || t("search.details.no.description")}
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
                <div className="windows95-text text-hint text-xs">{field.label}</div>
                <div className="windows95-text mt-0.5 text-xs wrap-break-word whitespace-pre-wrap">
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {view.infoHash && (
        <DetailSection icon={<Info className="size-3" />} title={t("search.details.hash")}>
          <p className="windows95-text text-xs break-all">{view.infoHash}</p>
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
                onClick={() => openUrl(url).catch((error) => console.warn("openUrl failed", error))}
                title={t("search.details.open.image")}
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
                <span className="windows95-text min-w-0 flex-1 truncate text-xs" title={file.name}>
                  {file.name}
                </span>
                <span className="windows95-text text-hint shrink-0 text-xs">
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
          <span className="windows95-text text-hint text-xs">
            {t("search.details.no.comments")}
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
                  <span className="text-hint shrink-0">{comment.date}</span>
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
  );
}
