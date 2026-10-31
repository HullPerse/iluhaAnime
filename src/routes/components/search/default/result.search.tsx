import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { SOURCE_INFOS } from "@/config/search/searchSources.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useTorrentCover } from "@/hooks/search/cover.hook";
import { queryKeys } from "@/lib/core/keys.utils";
import { detectLanguages, formatReleaseAge, formatSize } from "@/lib/search/searchFormat.utils";
import { getLanguageColors } from "@/lib/core/results.utils";
import { useCell } from "@/lib/core/signal.hook";
import { ignore } from "@/lib/core/promise.utils";
import { coverVisual } from "@/lib/torrent/coverVisual.utils";
import TorrentActions from "@/routes/components/search/default/actions.search";
import CoverCorrectionModal from "@/routes/components/search/default/correction.search";
import { removeResolvedCover } from "@/store/cover.store";
import { settingsAtoms } from "@/store/settings.store";
import type { ResultSearchProps as Props } from "@/types/search/search";

export default function SearchResultItem({
  item,
  source,
  loadingMagnet,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
  onOpenLink,
  onOpenDetails,
}: Props) {
  const busy = loadingMagnet[item.link] ?? false;
  const colors = getLanguageColors();
  const { t } = useI18n();
  const sourceInfo = SOURCE_INFOS.find((info) => info.value === source);
  const sourceLabel = sourceInfo?.label ?? source;
  const hasMagnet = Boolean(item.magnet) || source === "rutracker";
  const releaseAge = formatReleaseAge(item.date);
  const [correcting, setCorrecting] = useState<boolean>(false);
  const coverMode = useCell(settingsAtoms.torrentCoverMode);
  const cover = useTorrentCover(item.title, { source, url: item.link, mode: coverMode });
  const visual = coverVisual(cover, coverMode);
  const coverTitle: Record<string, string> = {
    override: t("search.cover.correct.manual"),
    page: t("search.cover.page.poster"),
  };
  const queryClient = useQueryClient();
  const refreshCover = () => {
    removeResolvedCover(cover.coverKey);
    ignore(
      queryClient.invalidateQueries({ queryKey: queryKeys.coverResolveScope(cover.coverKey) })
    );
  };
  const total = item.seeders + item.leechers;
  const share = total > 0 ? Math.round((item.seeders / total) * 100) : 0;

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
              onClick={refreshCover}
              onContextMenu={(event) => {
                event.preventDefault();
                setCorrecting(true);
              }}
              data-vim-contextmenu="cover"
              title={t("search.cover.refresh")}
              aria-label={t("search.cover.refresh")}
            >
              <ImageComponent
                src={visual.src}
                alt=""
                title={coverTitle[cover.status]}
                className="h-full w-full object-cover"
              />
            </button>
          )
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1">
            <span className="windows95-font bg-secondary text-title-text px-1 text-xs">
              {sourceLabel}
              {sourceInfo?.nsfw && <span className="text-destructive font-bold">[NSFW]</span>}
            </span>
            {detectLanguages(item.title).map((l) => (
              <span
                key={l.code}
                className={cn(
                  "windows95-font px-1 text-xs",
                  colors[l.code as keyof typeof colors] || "bg-muted text-white"
                )}
              >
                {l.label}
              </span>
            ))}
          </div>
          <h3 className="windows95-text leading-snug font-bold">
            <button
              type="button"
              className="line-clamp-2 w-full cursor-pointer text-left hover:underline"
              onClick={() => onOpenDetails(item)}
              data-vim-target="result-title"
              title={item.title}
            >
              {item.title}
            </button>
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="windows95-text text-xs">
              <span className="text-hint">{t("search.details.size")}: </span>
              {formatSize(item.size) || "-"}
            </span>
            <span className="windows95-text text-xs">
              <span className="text-hint">S: </span>
              <span className="text-success">{item.seeders}</span>
            </span>
            <span className="windows95-text text-xs">
              <span className="text-hint">L: </span>
              <span className="text-destructive">{item.leechers}</span>
            </span>
            {releaseAge && (
              <span className="windows95-text text-hint text-xs" title={item.date}>
                {releaseAge}
              </span>
            )}
          </div>
          <div
            className="border-muted bg-surface mt-0.5 h-2 w-full border"
            role="img"
            aria-label={`seeders ${item.seeders}, leechers ${item.leechers}`}
            title={`seeders ${item.seeders}, leechers ${item.leechers}`}
          >
            <div className="bg-success h-full" style={{ width: `${share}%` }} />
          </div>
        </div>
      </div>

      {busy && (
        <div className="flex items-center gap-1">
          <SmallLoader size={3} />
          <span className="windows95-text">{t("search.loading.magnet")}</span>
        </div>
      )}
      {!busy && hasMagnet && (
        <TorrentActions
          item={item}
          busy={busy}
          onCopyMagnet={onCopyMagnet}
          onOpenMagnet={onOpenMagnet}
          onDownload={onDownload}
          label={item.title}
        />
      )}
      {!busy && !hasMagnet && item.link && (
        <Button
          onClick={() => onOpenLink(item)}
            className="windows95-active-border bg-primary windows95-text text-text inline-flex cursor-pointer items-center gap-0.5 px-2 py-0.5 no-underline"
          >
            <ImageComponent src="/images/w2k_globe.ico" alt="" className="size-4" />
          {t("search.open")}
        </Button>
      )}
      {correcting && (
        <CoverCorrectionModal
          torrentTitle={item.title}
          cover={cover}
          onClose={() => setCorrecting(false)}
        />
      )}
    </article>
  );
}
