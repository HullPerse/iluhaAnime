import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { ChevronDown, ChevronRight, Loader, RefreshCw } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/i18n";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";

import TorrentFilesSection from "../torrent/file.torrent";

interface Props {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  isExpanded: boolean;
  torrentLoading: boolean;
  onToggleExpand: () => void;
  hideHeader?: boolean;
}

export default function TorrentFilesPlayerSection({
  item,
  files,
  isExpanded,
  torrentLoading,
  onToggleExpand,
  hideHeader,
}: Props) {
  const { data = [], refetch } = useQuery({
    queryKey: ["extra_files", item.save_dir],
    queryFn: () =>
      invoke<{ path: string; name: string; size: number }[]>(
        "scan_extra_files",
        { path: item.save_dir! }
      ).then((result) =>
        result.map((f) => ({ name: f.name, size: f.size, fullPath: f.path }))
      ),
    enabled: !!item.save_dir,
  });

  const handleUpscaleDone = useCallback(
    (_filePath: string) => {
      refetch();
    },
    [refetch]
  );

  const handleDeleteExtraFile = useCallback(() => {
    refetch();
  }, [refetch]);

  const { t } = useI18n();

  return (
    <section className="windows95-active-border bg-primary flex flex-col gap-1">
      {!hideHeader && (
        <div className="bg-secondary flex items-center gap-1 px-1 text-white">
          <span className="windows95-text line-clamp-1 flex-1 py-0.5 font-bold">
            {item.name}
          </span>
        </div>
      )}

      {torrentLoading && !files ? (
        <div className="windows95-text flex items-center gap-1 px-0.5 py-0.5">
          <Loader className="size-3 animate-spin" />
          <span className="text-xs">{t("player.files.loading")}</span>
        </div>
      ) : files ? (
        <section className="flex flex-col gap-1">
          <div className="windows95-text flex w-full items-center gap-1 text-left select-none">
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-label={t("player.files.count", {
                count: files.filter((f) => f.completed).length,
              })}
              className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
              onClick={onToggleExpand}
            >
              {isExpanded ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {t("player.files.count", {
                count: files.filter((f) => f.completed).length,
              })}{" "}
              {data.length > 0 &&
                t("player.files.upscales", { count: data.length })}
            </button>
            <Button
              size="icon"
              className="ml-auto size-5"
              title={t("player.files.refresh")}
              onClick={(e) => {
                e.stopPropagation();
                refetch();
              }}
            >
              <RefreshCw className="size-3" />
            </Button>
            <Button
              size="icon"
              className="size-5"
              title={t("player.files.openFolder")}
              onClick={(e) => {
                e.stopPropagation();
                openPath(item.save_dir);
              }}
            >
              <ImageComponent
                src="/images/w2k_folder_closed.ico"
                alt=""
                className="size-4"
              />
            </Button>
          </div>
          {isExpanded && (
            <TorrentFilesSection
              id={item.id}
              files={files.filter((f) => f.completed)}
              type="player"
              path={item.save_dir}
              extraFiles={data}
              onUpscaleDone={handleUpscaleDone}
              onDeleteExtraFile={handleDeleteExtraFile}
            />
          )}
        </section>
      ) : null}

      {item.error && (
        <span className="text-destructive windows95-text flex w-full items-center gap-1">
          {item.error}
        </span>
      )}
    </section>
  );
}
