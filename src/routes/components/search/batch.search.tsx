import { ChevronDown, ChevronRight, Clipboard, Download, Magnet } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useTorrentCover } from "@/hooks/search/cover.hook";
import { formatBytes } from "@/lib/core/bytes.utils";
import { useCell } from "@/lib/core/signal.hook";
import { coverVisual } from "@/lib/torrent/coverVisual.utils";
import { batchEpisodeNumber } from "@/lib/torrent/batch.utils";
import { parseSize } from "@/lib/search/searchFormat.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { Source } from "@/types/search/search";
import type { Anime, BatchGroup } from "@/types/torrent/torrent";

function episodeNumber(item: Anime): number | undefined {
  return batchEpisodeNumber(item);
}

export default function SearchBatchResultItem({
  group,
  source,
  busy,
  progress,
  loadingMagnet,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
  onDownloadAll,
  onOpenDetails,
}: {
  group: BatchGroup;
  source: Source;
  busy: boolean;
  progress: { done: number; total: number } | null;
  loadingMagnet: Record<string, boolean>;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  onDownloadAll: (items: Anime[]) => void;
  onOpenDetails: (item: Anime) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<boolean>(false);
  const coverMode = useCell(settingsAtoms.torrentCoverMode);
  const first = group.items[0];
  const cover = useTorrentCover(first?.title ?? group.title, {
    source,
    url: first?.link,
    pageUrl: first?.website,
    mode: coverMode,
  });
  const visual = coverVisual(cover, coverMode);
  if (!first) return null;

  const totalBytes = group.items.reduce((sum, item) => sum + parseSize(item.size), 0);
  const seeders = Math.max(...group.items.map((item) => item.seeders));
  const leechers = Math.max(...group.items.map((item) => item.leechers));
  const episodes = group.items.filter((item) => episodeNumber(item) !== undefined).length;
  const season =
    group.season !== undefined && group.season > 1
      ? ` · ${t("search.batch.season", { season: group.season })}`
      : "";
  const total = seeders + leechers;
  const share = total > 0 ? Math.round((seeders / total) * 100) : 0;

  return (
    <article className="windows95-active-border bg-primary flex min-w-0 flex-col gap-1 p-1.5">
      <div className="flex items-start gap-2">
        {visual.mode === "waiting" ? (
          <div
            className="border-muted bg-surface h-40 w-28 shrink-0 animate-pulse border motion-reduce:animate-none"
            aria-hidden
          />
        ) : (
          visual.mode === "show" && (
            <button
              type="button"
              className="border-muted h-40 w-28 shrink-0 cursor-pointer border p-0 hover:brightness-110"
              onClick={() => onOpenDetails(first)}
              title={t("search.details.open.image")}
              aria-label={t("search.details.open.image")}
            >
              <ImageComponent src={visual.src} alt="" className="h-full w-full object-cover" />
            </button>
          )
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            <span className="windows95-font bg-secondary text-title-text px-1 text-xs">
              {group.group || "erai-raws"}
            </span>
            <span className="windows95-font bg-surface text-title-text px-1 text-xs">
              {t("search.batch.episodes", { count: group.items.length })}
            </span>
          </div>
          <h3 className="windows95-text leading-snug font-bold">
            <button
              type="button"
              className="line-clamp-2 w-full cursor-pointer text-left hover:underline"
              onClick={() => setExpanded((value) => !value)}
              title={group.title}
            >
              {group.title}
              {season}
            </button>
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="windows95-text text-xs">
              <span className="text-hint">{t("search.details.size")}: </span>
              {totalBytes > 0 ? formatBytes(totalBytes) : (first.size || "-")}
            </span>
            <span className="windows95-text text-xs">
              <span className="text-hint">S: </span>
              <span className="text-success">{seeders}</span>
            </span>
            <span className="windows95-text text-xs">
              <span className="text-hint">L: </span>
              <span className="text-destructive">{leechers}</span>
            </span>
            {episodes > 0 && (
              <span className="windows95-text text-hint text-xs">
                {t("search.batch.episodes", { count: episodes })}
              </span>
            )}
          </div>
          <div
            className="border-muted bg-surface mt-0.5 h-2 w-full border"
            role="img"
            aria-label={`seeders ${seeders}, leechers ${leechers}`}
            title={`seeders ${seeders}, leechers ${leechers}`}
          >
            <div className="bg-success h-full" style={{ width: `${share}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          className="h-6 px-2 text-xs"
          disabled={busy}
          onClick={() => onDownloadAll(group.items)}
        >
          <Download className="size-3" />
          {t("search.batch.download.all", { count: group.items.length })}
        </Button>
        <Button
          className="h-6 px-2 text-xs"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {t(expanded ? "search.batch.hide" : "search.batch.show")}
        </Button>
        {progress && (
          <span className="text-hint ml-auto text-xs tabular-nums">
            {t("search.batch.progress", { done: progress.done, total: progress.total })}
          </span>
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5">
          {group.items.map((item, index) => {
            const number = episodeNumber(item);
            const itemBusy = loadingMagnet[item.link] ?? false;
            return (
              <div
                key={`${item.link}-${index}`}
                className="windows95-border bg-field flex min-w-0 items-center gap-1 p-1 text-xs"
              >
                <button
                  type="button"
                  className="windows95-text min-w-0 flex-1 truncate text-left hover:underline"
                  title={item.title}
                  onClick={() => onOpenDetails(item)}
                >
                  {number === undefined
                    ? item.title
                    : t("search.batch.episode", { number })}
                </button>
                <span className="windows95-text text-hint shrink-0">{item.size}</span>
                <span className="windows95-text text-success shrink-0">S {item.seeders}</span>
                {itemBusy ? (
                  <SmallLoader size={3} />
                ) : (
                  <>
                    <Button
                      size="icon"
                      className="size-4"
                      title={t("search.details.copy")}
                      aria-label={t("search.details.copy")}
                      onClick={() => onCopyMagnet(item)}
                    >
                      <Clipboard className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      className="size-4"
                      title={t("search.magnet")}
                      aria-label={t("search.magnet")}
                      onClick={() => onOpenMagnet(item)}
                    >
                      <Magnet className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      className="size-4"
                      title={t("search.download")}
                      aria-label={t("search.download")}
                      onClick={() => onDownload(item)}
                    >
                      <Download className="size-3" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
