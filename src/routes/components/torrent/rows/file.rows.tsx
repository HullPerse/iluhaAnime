import { openPath } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import { ArrowDownNarrowWide, RefreshCw } from "lucide-react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { parseMediaPath } from "@/lib/media/parse.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { useCell } from "@/lib/state/signal.hook";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { setAnilistSearchQuery } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import type { TorrentTreeFile, TorrentTreeFileWithPath } from "@/types/torrent";

import { PlayerFileActions } from "../actions.torrent";

export function TorrentFileRow({
  file,
  depth,
  virtualStart,
  type,
  checked,
  onToggleFile,
  queueMap,
  extraFiles,
  path,
  onDeleteExtraFile,
  onUpscaleDone,
  onPlay,
  onRedownload,
  sequential,
}: {
  file: TorrentTreeFile;
  depth: number;
  virtualStart: number;
  type: "torrent" | "player";
  checked: boolean;
  sequential?: boolean;
  onToggleFile?: () => void;
  queueMap: Map<string, string>;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  path?: string;
  onDeleteExtraFile?: () => void;
  onUpscaleDone?: () => void;
  onRedownload?: (fileIndex: number) => void;
  onPlay?: (path: string, name: string) => void;
}) {
  const { t } = useI18n();
  const parseTitles = useCell(settingsAtoms.parseTitlesTorrent);
  const fullPath = (file as TorrentTreeFileWithPath).fullPath;

  return (
    <div
      className={cn(
        "windows95-text absolute top-0 left-0 flex w-full items-center gap-1 px-1 select-none",
        !(type === "torrent" && file.completed) && "hover:bg-surface hover:cursor-pointer"
      )}
      style={{
        height: 18,
        transform: `translateY(${virtualStart}px)`,
        paddingLeft: `${depth * 12 + 2}px`,
      }}
    >
      {onToggleFile && (
        <Checkbox
          checked={checked}
          onChange={onToggleFile}
          disabled={file.completed}
          className="size-3"
        />
      )}

      <ImageComponent src="/images/w2k_wmp_11.ico" alt="" className="size-4" />

      <span
        className="flex-1 truncate"
        title={file.displayName}
        onContextMenu={(e) => {
          e.preventDefault();
          if (type === "player") openPath(String(path));
        }}
        onClick={() => {
          if (type === "torrent") return;
          setAnilistSearchQuery(parseMediaPath(fullPath ?? file.displayName).searchTitle);
        }}
      >
        {type === "player" && parseTitles
          ? formatParsedTitle(fullPath ?? file.displayName, t)
          : file.displayName}
      </span>

      {sequential && (
        <span
          className="text-secondary shrink-0"
          title={t("torrent.sequential.current")}
          data-testid="torrent-file-sequential"
        >
          <ArrowDownNarrowWide className="size-3.5" />
        </span>
      )}

      {file.selected && !file.completed && file.size > 0 && (
        <ProgressBar
          className="ml-1 h-3 w-10 shrink-0"
          value={file.progress_bytes}
          max={file.size}
          ariaLabel={file.displayName}
        />
      )}

      <span className="text-hint shrink-0">{formatBytes(file.size)}</span>

      {type === "torrent" && file.completed && !file.exists && onRedownload && (
        <Button
          title={t("torrent.redownload")}
          size="icon"
          className="size-4"
          onClick={() => onRedownload(file.index)}
        >
          <RefreshCw className="size-3" />
        </Button>
      )}

      {type === "player" && (
        <PlayerFileActions
          file={file}
          fullPath={fullPath}
          path={path}
          queueMap={queueMap}
          extraFiles={extraFiles}
          onDeleteExtraFile={onDeleteExtraFile}
          onUpscaleDone={onUpscaleDone}
          onPlay={onPlay}
        />
      )}
    </div>
  );
}
