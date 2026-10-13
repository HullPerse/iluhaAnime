import { openPath } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import { ArrowDownNarrowWide, RefreshCw } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { fileNameFromPath, isTrackFileName, parseMediaPath } from "@/lib/media/parse.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { useCell } from "@/lib/state/signal.hook";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { joinMediaPath } from "@/lib/utils/media.utils";
import { setAnilistSearchQuery } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import type { TorrentTreeFile, TorrentTreeFileWithPath } from "@/types/torrent";

import { PlayerFileActions } from "../actions.torrent";

interface PlayerRowTarget {
  resolvedPath: string | undefined;
  track: boolean;
  busy: boolean;
}

function resolvePlayerRowTarget(
  file: TorrentTreeFile,
  fullPath: string | undefined,
  saveDir: string | undefined,
  queueMap: Map<string, string>,
  trackExts: Set<string>
): PlayerRowTarget {
  const resolvedPath = fullPath ?? (saveDir ? joinMediaPath(saveDir, file.name) : undefined);
  const track = isTrackFileName(fileNameFromPath(resolvedPath ?? file.displayName), trackExts);
  const queueStatus = resolvedPath ? queueMap.get(resolvedPath) : undefined;
  return {
    resolvedPath,
    track,
    busy: queueStatus === "queued" || queueStatus === "processing",
  };
}

function searchPlayerFile(
  type: "torrent" | "player",
  track: boolean,
  resolvedPath: string | undefined,
  displayName: string
): void {
  if (type !== "player" || track) return;
  setAnilistSearchQuery(parseMediaPath(resolvedPath ?? displayName).searchTitle);
}

function handlePlayerContextMenu(
  event: MouseEvent,
  args: {
    type: "torrent" | "player";
    track: boolean;
    busy: boolean;
    completed: boolean;
    exists: boolean;
    resolvedPath: string | undefined;
    saveDir: string | undefined;
    onOpenInApp?: (fullPath: string) => void;
  }
): void {
  event.preventDefault();
  if (args.type !== "player") return;
  if (event.ctrlKey || event.metaKey) {
    if (args.track || args.busy || !args.completed || !args.exists || !args.resolvedPath) return;
    args.onOpenInApp?.(args.resolvedPath);
    return;
  }
  openPath(String(args.saveDir));
}

interface FileRowInteractions {
  /** Player rows act on a plain click (search in AniList). */
  interactive: boolean;
  /** A right-click opens the save folder. */
  contextMenu: boolean;
  /** Ctrl+click opens the file in the app. */
  ctrlClick: boolean;
}

/**
 * Which mouse actions the row name actually has. Torrent rows have none, so
 * they stay plain text and never enter the tab order; the ctrl-click badge is
 * only advertised when the dispatch would really do something.
 */
function resolveFileRowInteractions(args: {
  type: "torrent" | "player";
  track: boolean;
  busy: boolean;
  completed: boolean;
  exists: boolean;
  resolvedPath: string | undefined;
  saveDir: string | undefined;
  onOpenInApp: ((fullPath: string) => void) | undefined;
}): FileRowInteractions {
  const interactive = args.type === "player" && !args.track;
  return {
    interactive,
    contextMenu: interactive && Boolean(args.saveDir),
    ctrlClick:
      interactive &&
      !args.busy &&
      args.completed &&
      args.exists &&
      Boolean(args.resolvedPath) &&
      Boolean(args.onOpenInApp),
  };
}

/** Row name cell: plain text, or a hintable, keyboard-activatable button. */
function FileNameCell({
  title,
  interactions,
  onActivate,
  onOpenFolder,
  children,
}: {
  title: string;
  interactions: FileRowInteractions;
  onActivate: () => void;
  onOpenFolder: (event: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <span
      className="flex-1 truncate"
      title={title}
      role={interactions.interactive ? "button" : undefined}
      tabIndex={interactions.interactive ? 0 : undefined}
      data-vim-target={interactions.interactive ? "file" : undefined}
      data-vim-contextmenu={interactions.contextMenu ? "file" : undefined}
      data-vim-ctrlclick={interactions.ctrlClick ? "file" : undefined}
      onKeyDown={interactions.interactive ? enterOrSpace(onActivate) : undefined}
      onContextMenu={onOpenFolder}
      onClick={onActivate}
    >
      {children}
    </span>
  );
}

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
  onOpenInApp,
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
  const openSearch = () => searchPlayerFile(type, track, resolvedPath, file.displayName);

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
