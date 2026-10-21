import { openPath } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import {
  ArrowDownNarrowWide,
  FolderOpen,
  Monitor,
  Play,
  RefreshCw,
  Search,
  Wand2,
} from "lucide-react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { useRef } from "react";

import ContextMenu from "@/components/shared/contextMenu.component";
import type { ContextMenuEntry } from "@/components/shared/contextMenu.component";
import ProgressBar from "@/components/shared/progress.component";
import TreeRowNumber from "@/components/shared/treeNumber.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { clickRowActionButton } from "@/lib/hotkeys/dispatch.hotkeys";
import { fileNameFromPath, isTrackFileName, parseMediaPath } from "@/lib/media/parse.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import type { TreeRow } from "@/lib/player/treeArrow.utils";
import { useCell } from "@/lib/state/signal.hook";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import { joinMediaPath } from "@/lib/utils/media.utils";
import { setAnilistSearchQuery } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import type { TorrentTreeFile, TorrentTreeFileWithPath } from "@/types/torrent";

import { PlayerFileActions } from "../actions.torrent";

function QueuePosition({ position }: { position?: number }) {
  const { t } = useI18n();
  if (position === undefined) return null;
  return (
    <span
      className="text-hint shrink-0 tabular-nums"
      title={t("torrent.queue.position", { position })}
      data-testid="torrent-file-queue-position"
    >
      {position}.
    </span>
  );
}

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
  interactive: boolean;
  contextMenu: boolean;
  ctrlClick: boolean;
}

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

function FileNameCell({
  title,
  interactions,
  onActivate,
  onOpenFolder,
  menuEntries,
  onCtrlContextMenu,
  children,
}: {
  title: string;
  interactions: FileRowInteractions;
  onActivate: () => void;
  onOpenFolder: (event: MouseEvent) => void;
  menuEntries: ContextMenuEntry[] | null;
  onCtrlContextMenu: ((event: MouseEvent) => void) | null;
  children: ReactNode;
}) {
  const cell = (
    <span
      className="focus-visible:outline-text flex-1 truncate outline-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
      title={title}
      role={interactions.interactive ? "button" : undefined}
      tabIndex={interactions.interactive ? 0 : undefined}
      data-vim-target={interactions.interactive ? "file" : undefined}
      data-tree-activate={interactions.interactive ? "" : undefined}
      data-vim-contextmenu={interactions.contextMenu ? "file" : undefined}
      data-vim-ctrlclick={interactions.ctrlClick ? "file" : undefined}
      onKeyDown={interactions.interactive ? enterOrSpace(onActivate) : undefined}
      onContextMenu={menuEntries ? undefined : onOpenFolder}
      onContextMenuCapture={onCtrlContextMenu ?? undefined}
    >
      {children}
    </span>
  );
  if (!menuEntries) return cell;
  return <ContextMenu entries={menuEntries}>{cell}</ContextMenu>;
}

function TorrentRowShell({
  rootRef,
  rowKey,
  depth,
  virtualStart,
  type,
  completed,
  rows,
  anchorPath,
  children,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  rowKey: string;
  depth: number;
  virtualStart: number;
  type: "torrent" | "player";
  completed: boolean;
  rows?: readonly TreeRow[];
  anchorPath?: string | null;
  children: ReactNode;
}) {
  const player = type === "player";
  return (
    <div
      ref={rootRef}
      data-tree-row
      data-tree-path={rowKey}
      data-tree-kind="file"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button, input")) return;
        event.preventDefault();
        event.currentTarget.focus();
      }}
      className={cn(
        "windows95-text focus-visible:outline-text absolute top-0 left-0 flex w-full items-center gap-1 px-1 select-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
        player ? "windows95-border bg-field" : undefined,
        (player || !(type === "torrent" && completed)) && "hover:bg-surface"
      )}
      style={{
        height: player ? 20 : 18,
        transform: `translateY(${virtualStart}px)`,
        paddingLeft: `${depth * 12 + 2}px`,
      }}
    >
      {player && anchorPath != null && (
        <TreeRowNumber rows={rows ?? []} anchorPath={anchorPath} rowPath={rowKey} />
      )}
      {children}
    </div>
  );
}

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
  const openSearch = () => searchPlayerFile(type, track, resolvedPath, file.displayName);
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

      <span className="text-hint min-w-16 shrink-0 text-right whitespace-nowrap tabular-nums">
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
