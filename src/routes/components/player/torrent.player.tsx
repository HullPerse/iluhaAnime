import { openPath } from "@tauri-apps/plugin-opener";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { TORRENT_RESIZE_STEP } from "@/config/torrents.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useTorrentInAppPlayer } from "@/hooks/player/inAppPlayer.hook";
import { useTorrentCardResize } from "@/hooks/torrentResize.hook";
import { isVideoFileName } from "@/lib/parse.utils";
import { queryKeys } from "@/lib/keys.utils";
import { useCell } from "@/lib/signal.hook";
import { isCheckingFiles } from "@/lib/torrentCommon.utils";
import { invokeTyped } from "@/lib/invoke.utils";
import { settingsAtoms } from "@/store/settings.store";
import type { TorrentPlayerProps as Props } from "@/types/player";

import TorrentFilesSection from "../torrent/file.torrent";
import { TorrentPendingState } from "../torrent/sections/pending.sections";

function SectionActions({ onRefresh, saveDir }: { onRefresh: () => void; saveDir: string }) {
  const { t } = useI18n();
  return (
    <>
      <Button size="icon" className="size-5" title={t("player.files.refresh")} onClick={onRefresh}>
        <RefreshCw className="size-3" />
      </Button>
      <Button
        size="icon"
        className="size-5"
        title={t("player.files.open.folder")}
        onClick={() => openPath(saveDir)}
      >
        <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4" />
      </Button>
    </>
  );
}

export default function TorrentFilesPlayerSection({
  item,
  files,
  isExpanded,
  torrentLoading,
  onToggleExpand,
  hideHeader,
}: Props) {
  const { data = [], refetch } = useAppQuery("slow", {
    queryKey: queryKeys.extraFiles(item.save_dir),
    queryFn: () =>
      invokeTyped<{ path: string; name: string; size: number }[]>("scan_extra_files", {
        path: item.save_dir!,
      }).then((result) => result.map((f) => ({ name: f.name, size: f.size, fullPath: f.path }))),
    enabled: !!item.save_dir,
  });

  const handleUpscaleDone = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDeleteExtraFile = useCallback(() => {
    refetch();
  }, [refetch]);

  const { t } = useI18n();
  const videoExtensions = useCell(settingsAtoms.videoExtensions);
  const rootRef = useRef<HTMLElement>(null);
  const { listHeight, beginDrag, adjust } = useTorrentCardResize(item.info_hash, rootRef);

  const playable = useMemo(
    () =>
      (files ?? []).filter(
        (file) => file.completed && file.size > 0 && isVideoFileName(file.name, videoExtensions)
      ),
    [files, videoExtensions]
  );

  const openInAppPlayer = useTorrentInAppPlayer(
    playable,
    item.save_dir,
    data.map((entry) => entry.fullPath),
    item.id
  );

  const hasFiles = playable.length > 0;
  const hasExtras = data.length > 0;
  const hasContent = hasFiles || hasExtras;
  const counts = [
    hasFiles ? t("player.files.count", { count: playable.length }) : "",
    hasExtras ? t("player.files.upscales", { count: data.length }) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section ref={rootRef} className="windows95-active-border bg-primary flex flex-col gap-1">
      {!hideHeader && (
        <div className="bg-secondary text-title-text flex items-center gap-1 px-1">
          <span className="windows95-text line-clamp-1 flex-1 py-0.5 font-bold">{item.name}</span>
        </div>
      )}

      {torrentLoading && !files ? (
        <div className="windows95-text flex items-center gap-1 px-0.5 py-0.5">
          <SmallLoader size={3} />
          <span className="text-xs">
            {isCheckingFiles(item) ? t("torrent.checking.files") : t("player.files.loading")}
          </span>
        </div>
      ) : hasContent ? (
        <section className="flex flex-col gap-1">
          <div className="windows95-text flex w-full items-center gap-1 text-left select-none">
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={counts}
              className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
              onClick={onToggleExpand}
            >
              {isExpanded ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {counts}
            </button>
            <SectionActions onRefresh={() => refetch()} saveDir={item.save_dir} />
          </div>
          {isExpanded && (
            <TorrentFilesSection
              id={item.id}
              files={playable}
              type="player"
              path={item.save_dir}
              listHeight={listHeight}
              extraFiles={data}
              onUpscaleDone={handleUpscaleDone}
              onDeleteExtraFile={handleDeleteExtraFile}
              onOpenInApp={openInAppPlayer}
            />
          )}
        </section>
      ) : files ? (
        <TorrentPendingState
          item={item}
          actions={<SectionActions onRefresh={() => refetch()} saveDir={item.save_dir} />}
        />
      ) : null}

      {isExpanded && hasContent ? (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("player.files.resize")}
          title={t("player.files.resize")}
          aria-valuenow={listHeight ? Math.round(listHeight) : undefined}
          tabIndex={0}
          data-vim-target="resize"
          className="bg-surface hover:bg-highlight focus-visible:outline-text h-1.5 shrink-0 cursor-s-resize touch-none select-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
          onMouseDown={beginDrag}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            adjust((event.key === "ArrowUp" ? -1 : 1) * TORRENT_RESIZE_STEP);
          }}
        />
      ) : null}

      {item.error && (
        <span className="text-destructive windows95-text flex w-full items-center gap-1">
          {item.error}
        </span>
      )}
    </section>
  );
}
