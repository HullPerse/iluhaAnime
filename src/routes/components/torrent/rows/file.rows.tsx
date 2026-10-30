import { openPath } from "@tauri-apps/plugin-opener";
import {
  ArrowDownNarrowWide,
  FolderOpen,
  Monitor,
  Play,
  RefreshCw,
  Search,
  Wand2,
} from "lucide-react";
import { useRef } from "react";
import type { MouseEvent } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { clickRowActionButton } from "@/lib/core/dispatchHotkeys.utils";
import { formatParsedTitle } from "@/lib/player/playerTitle.utils";
import { parseMediaPath } from "@/lib/search/parse.utils";
import { formatBytes } from "@/lib/core/bytes.utils";
import { useCell } from "@/lib/core/signal.hook";
import {
  handlePlayerContextMenu,
  onDiskTitle,
  resolveFileRowInteractions,
  resolvePlayerRowTarget,
} from "@/lib/torrent/torrentFileRow.utils";
import { setAnilistSearchQuery } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import type { ContextMenuEntry } from "@/types/ui/contextMenu";
import type { TreeRow } from "@/types/core/treeArrow";
import type { TorrentTreeFile, TorrentTreeFileWithPath } from "@/types/torrent/torrent";

import { PlayerFileActions } from "@/routes/components/torrent/actions.torrent";
import { FileNameCell } from "@/routes/components/torrent/rows/file/nameCell.file";
import { QueuePosition } from "@/routes/components/torrent/rows/file/queuePosition.file";
import { TorrentRowShell } from "@/routes/components/torrent/rows/file/shell.file";

export function TorrentFileRow({
  file,
  depth,
  virtualStart,
  type,
  rows,
  anchorPath,
  checked,
  onToggleFile,
  queueMap,
  extraFiles,
  path,
  onDeleteExtraFile,
  onUpscaleDone,
  onPlay,
  onOpenInApp,
  onRedownload,
  sequential,
  queuePosition,
}: {
  file: TorrentTreeFile;
  depth: number;
  virtualStart: number;
  type: "torrent" | "player";
  rows?: readonly TreeRow[];
  anchorPath?: string | null;
  checked: boolean;
  sequential?: boolean;
  queuePosition?: number;
  onToggleFile?: () => void;
  queueMap: Map<string, string>;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  path?: string;
  onDeleteExtraFile?: () => void;
  onUpscaleDone?: () => void;
  onRedownload?: (fileIndex: number) => void;
  onPlay?: (path: string, name: string) => void;
  onOpenInApp?: (fullPath: string) => void;
}) {
  const { t } = useI18n();
  const parseTitles = useCell(settingsAtoms.parseTitlesTorrent);
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);
  const fullPath = (file as TorrentTreeFileWithPath).fullPath;
  const trackExts = new Set([...audioExtensions, ...subtitleExtensions]);
  const target = resolvePlayerRowTarget(file, fullPath, path, queueMap, trackExts);
  const { resolvedPath, track, busy } = target;
  const interactions = resolveFileRowInteractions({
    type,
    track,
    busy,
    completed: file.completed,
    exists: file.exists,
    resolvedPath,
    saveDir: path,
    onOpenInApp,
  });
  const openSearch = () => {
    if (type !== "player" || track) return;
    setAnilistSearchQuery(parseMediaPath(resolvedPath ?? file.displayName).searchTitle);
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const rowKey = `file:${file.index}`;

  const entryDisabled = !file.exists || busy;
  const clickOwn = (name: "external" | "builtin" | "upscale"): void => {
    clickRowActionButton(rootRef.current, name);
  };
  const menuEntries: ContextMenuEntry[] | null = interactions.interactive
    ? [
        {
          kind: "item",
          id: "external",
          label: "player.folder.open.media.player",
          icon: Monitor,
          disabled: entryDisabled,
          onSelect: () => clickOwn("external"),
        },
        {
          kind: "item",
          id: "builtin",
          label: "player.folder.open.iluha.player",
          icon: Play,
          disabled: entryDisabled,
          onSelect: () => clickOwn("builtin"),
        },
        {
          kind: "item",
          id: "search",
          label: "player.folder.search.anilist",
          icon: Search,
          onSelect: openSearch,
        },
        {
          kind: "item",
          id: "reveal",
          label: "player.files.open.folder",
          icon: FolderOpen,
          disabled: !path,
          onSelect: () => {
            if (path) openPath(path);
          },
        },
        {
          kind: "item",
          id: "upscale",
          label: "player.upscale.title",
          icon: Wand2,
          disabled: entryDisabled,
          onSelect: () => clickOwn("upscale"),
        },
      ]
    : null;
  const onCtrlContextMenu =
    interactions.interactive && type === "player"
      ? (event: MouseEvent): void => {
          if (!(event.ctrlKey || event.metaKey)) return;
          event.preventDefault();
          event.stopPropagation();
          if (track || busy || !file.completed || !file.exists || !resolvedPath) return;
          onOpenInApp?.(resolvedPath);
        }
      : null;

  return (
    <TorrentRowShell
      rootRef={rootRef}
      rowKey={rowKey}
      depth={depth}
      virtualStart={virtualStart}
      type={type}
      completed={file.completed}
      rows={rows}
      anchorPath={anchorPath}
    >
      {onToggleFile && (
        <Checkbox
          checked={checked}
          onChange={onToggleFile}
          disabled={file.completed}
          className="size-3"
          data-vim-target="file-check"
          aria-label={file.displayName}
        />
      )}

      <ImageComponent src="/images/w2k_wmp_11.ico" alt="" className="size-4" />

      <FileNameCell
        title={file.displayName}
        interactions={interactions}
        onActivate={openSearch}
        onOpenFolder={(e) => {
          handlePlayerContextMenu(e, {
            type,
            track,
            busy,
            completed: file.completed,
            exists: file.exists,
            resolvedPath,
            saveDir: path,
            onOpenInApp,
          });
        }}
        menuEntries={menuEntries}
        onCtrlContextMenu={onCtrlContextMenu}
      >
        {type === "player" && parseTitles
          ? formatParsedTitle(fullPath ?? file.displayName, t)
          : file.displayName}
      </FileNameCell>

      {sequential && (
        <span
          className="text-secondary shrink-0"
          title={t("torrent.sequential.current")}
          data-testid="torrent-file-sequential"
        >
          <ArrowDownNarrowWide className="size-3.5" />
        </span>
      )}

      <QueuePosition position={queuePosition} />

      {file.selected && !file.completed && file.size > 0 && (
        <ProgressBar
          className="ml-1 h-3 w-10 shrink-0"
          value={file.progress_bytes}
          max={file.size}
          ariaLabel={file.displayName}
        />
      )}

      <span
        className="text-hint min-w-16 shrink-0 text-right whitespace-nowrap tabular-nums"
        title={onDiskTitle(file, t)}
      >
        {formatBytes(file.size)}
      </span>

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
          onOpenInApp={onOpenInApp}
          track={track}
          onSearch={openSearch}
        />
      )}
    </TorrentRowShell>
  );
}
