import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatSize } from "@/lib/search/format.utils";
import TorrentActions from "@/routes/components/search/default/actions.search";
import type { Source } from "@/types/search";
import type { Anime, TorrentView } from "@/types/torrent";

import { MetaItem } from "./meta.details";

export default function DetailsHero({
  view,
  item,
  source,
  busy,
  poster,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
  onOpenOriginal,
  onZoom,
}: {
  view: TorrentView;
  item: Anime;
  source: Source;
  busy: boolean;
  poster: string | null;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  onOpenOriginal: () => void;
  onZoom: (url: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="windows95-border bg-surface flex flex-col gap-2 p-1.5 sm:flex-row">
      {poster ? (
        <button
          type="button"
          className="border-muted h-52 w-full shrink-0 cursor-zoom-in border p-0 hover:brightness-110 sm:w-36"
          onClick={() => onZoom(poster)}
          title={t("search.details.open.image")}
          aria-label={t("search.details.open.image")}
        >
          <ImageComponent src={poster} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="border-muted h-52 w-full shrink-0 border sm:w-36" aria-hidden>
          <ImageComponent
            src="/images/unknown_source.png"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="windows95-text text-hint text-xs break-all">
          {view.category}
          {view.author ? ` · ${t("search.details.author")}: ${view.author}` : ""}
        </p>
        <h2 className="windows95-text mt-0.5 text-sm font-bold wrap-break-word">
          {view.title || item.title}
        </h2>
        <p className="windows95-text text-hint mt-0.5 text-xs break-all">
          {source} - {view.url || item.link}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
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
        <div className="mt-1">
          <TorrentActions
            item={item}
            busy={busy}
            onCopyMagnet={onCopyMagnet}
            onOpenMagnet={onOpenMagnet}
            onDownload={onDownload}
            onOpenOriginal={onOpenOriginal}
            label={view.title || item.title}
          />
        </div>
      </div>
    </div>
  );
}
