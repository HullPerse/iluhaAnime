import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { parse } from "anitomy";
import {
  ChevronDown,
  ChevronRight,
  ListVideo,
  Monitor,
  Play,
  RefreshCw,
} from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/i18n";
import { collectFileIndices } from "@/lib/index.utils";
import { joinMediaPath, openFileInPlayer } from "@/lib/media.utils";
import { formatParsedTitle } from "@/lib/player.utils";
import { fmtSize } from "@/lib/torrent.utils";
import type { TorrentTreeNode, TorrentTreeFile } from "@/lib/torrent.utils";
import UpscalePlayer from "@/routes/components/player/upscale.player";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentFileInfo, FilePriority } from "@/types/torrent";

type TorrentTreeFileWithPath = TorrentTreeFile & { _fullPath: string };

function QueueStatusIcon({ status }: { status: string | undefined }) {
  if (status === "queued") return <ListVideo className="text-hint size-3" />;
  if (status === "processing")
    return <SmallLoader size={3} className="text-highlight" />;
  return null;
}

export function FolderRow({
  node,
  depth,
  virtualStart,
  files,
  isOpen,
  type,
  onToggleFolder,
  onPriorityChange,
}: {
  node: TorrentTreeNode;
  depth: number;
  virtualStart: number;
  files: TorrentFileInfo[];
  isOpen: boolean;
  type: "torrent" | "player";
  onToggleFolder: () => void;
  onPriorityChange?: (indices: number[], priority: FilePriority) => void;
}) {
  const { t } = useI18n();
  const folderIndices = collectFileIndices(node);
  const folderFiles = folderIndices
    .map((i) => files.find((f) => f.index === i))
    .filter((f): f is TorrentFileInfo => f !== undefined);
  const folderPriority =
    folderFiles.length > 0 &&
    folderFiles.every((f) => f.priority === folderFiles[0].priority)
      ? folderFiles[0].priority
      : "normal";

  return (
    <div
      className="windows95-text hover:bg-surface absolute top-0 left-0 flex w-full cursor-pointer items-center gap-1 px-0.5 py-0.5 text-left select-none"
      style={{
        height: 20,
        transform: `translateY(${virtualStart}px)`,
        paddingLeft: `${depth * 12 + 2}px`,
      }}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1"
        onClick={onToggleFolder}
      >
        {isOpen ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <ImageComponent
          src="/images/w2k_folder_closed.ico"
          alt=""
          className="size-4 shrink-0"
        />
        <span className="truncate font-bold" title={node.name}>
          {node.name}
        </span>
        <span className="text-hint whitespace-nowrap">
          {fmtSize(
            node.files.reduce((s, f) => s + f.size, 0) +
              node.children.reduce(
                (s, c) =>
                  s +
                  c.files.reduce((s2, f) => s2 + f.size, 0) +
                  c.children.reduce(
                    (s3, cc) =>
                      s3 + cc.files.reduce((s4, f) => s4 + f.size, 0),
                    0
                  ),
                0
              )
          )}
        </span>
      </div>
      {onPriorityChange && type === "torrent" && (
        <Select
          className="w-28"
          value={folderPriority}
          onChange={(v) => onPriorityChange(folderIndices, v as FilePriority)}
          options={[
            { value: "normal", label: t("torrent.priority.normal") },
            {
              value: "do_not_download",
              label: t("torrent.priority.skip"),
            },
          ]}
          arrow={false}
        />
      )}
    </div>
  );
}

function PlayerFileActions({
  file,
  fullPath,
  path,
  queueMap,
  extraFiles,
  onDeleteExtraFile,
  onUpscaleDone,
  onPlay,
}: {
  file: TorrentTreeFile;
  fullPath: string | undefined;
  path?: string;
  queueMap: Map<string, string>;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  onDeleteExtraFile?: () => void;
  onUpscaleDone?: (filePath: string) => void;
  onPlay?: (path: string, name: string) => void;
}) {
  const { t } = useI18n();
  const upscaledExtra = extraFiles?.find((e) => e.name === file.displayName);

  return (
    <div className="ml-auto flex flex-row gap-1">
      {fullPath ? (
        <>
          <Button
            rendered={!!upscaledExtra}
            title={t("common.delete")}
            size="icon"
            className="size-4"
            onClick={(e) => {
              e.stopPropagation();
              if (!upscaledExtra?.fullPath) return;
              invoke("delete_extra_file", {
                path: upscaledExtra.fullPath,
              }).catch(() => {});
              onDeleteExtraFile?.();
            }}
            disabled={!upscaledExtra}
          >
            <ImageComponent
              src="/images/w2k_dustbin.ico"
              alt=""
              className="size-4"
            />
          </Button>

          <QueueStatusIcon status={queueMap.get(fullPath)} />

          <UpscalePlayer
            filePath={fullPath}
            onDone={onUpscaleDone}
            exists={file.exists}
          />
          {onPlay && (
            <Button
              title={t("player.folder.builtinPlayer")}
              size="icon"
              className="size-4"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(fullPath, file.displayName);
              }}
              disabled={!file.exists}
            >
              <Play className="size-3" />
            </Button>
          )}
          <Button
            title={t("player.folder.openMediaPlayer")}
            size="icon"
            className="size-4"
            onClick={(e) => {
              e.stopPropagation();
              openFileInPlayer(fullPath).catch(() => {});
            }}
            disabled={!file.exists}
          >
            <Monitor className="size-3" />
          </Button>
        </>
      ) : (
        <>
          {path && (
            <QueueStatusIcon
              status={queueMap.get(joinMediaPath(path, file.name))}
            />
          )}

          {path && (
            <UpscalePlayer
              filePath={joinMediaPath(path, file.name)}
              exists={file.exists}
              onDone={onUpscaleDone}
            />
          )}
          {path && onPlay && (
            <Button
              title={t("player.folder.builtinPlayer")}
              size="icon"
              className="size-4"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(joinMediaPath(path, file.name), file.displayName);
              }}
              disabled={!file.exists}
            >
              <Play className="size-3" />
            </Button>
          )}
          {path && (
            <Button
              title={t("player.folder.openMediaPlayer")}
              size="icon"
              className="size-4"
              onClick={(e) => {
                e.stopPropagation();
                if (path) {
                  openFileInPlayer(joinMediaPath(path, file.name)).catch(
                    () => {}
                  );
                }
              }}
              disabled={!file.exists}
            >
              <Monitor className="size-3" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function TorrentFileRow({
  file,
  depth,
  virtualStart,
  type,
  checked,
  onToggleFile,
  onPriorityChange,
  queueMap,
  extraFiles,
  path,
  onDeleteExtraFile,
  onUpscaleDone,
  onPlay,
  onRedownload,
}: {
  file: TorrentTreeFile;
  depth: number;
  virtualStart: number;
  type: "torrent" | "player";
  checked: boolean;
  onToggleFile?: () => void;
  onPriorityChange?: (indices: number[], priority: FilePriority) => void;
  queueMap: Map<string, string>;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  path?: string;
  onDeleteExtraFile?: () => void;
  onUpscaleDone?: (filePath: string) => void;
  onRedownload?: (fileIndex: number) => void;
  onPlay?: (path: string, name: string) => void;
}) {
  const { t } = useI18n();
  const parseTitles = useSettingsStore((s) => s.parseTitles);
  const setAnilistSearchQuery = useSearchStore(
    (state) => state.setAnilistSearchQuery
  );
  const fullPath = (file as TorrentTreeFileWithPath)._fullPath;

  return (
    <div
      className={`windows95-text absolute top-0 left-0 flex w-full items-center gap-1 px-1 select-none ${type === "torrent" && file.completed ? "" : "hover:bg-surface hover:cursor-pointer"}`}
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

      <ImageComponent
        src="/images/w2k_wmp_11.ico"
        alt=""
        className="size-4"
      />

      <span
        className="flex-1 truncate"
        title={file.displayName}
        onContextMenu={(e) => {
          e.preventDefault();
          if (type === "player") openPath(String(path));
        }}
        onClick={() => {
          if (type === "torrent") return;
          const parsed = parse(file.displayName);
          if (!parsed) return;
          setAnilistSearchQuery(String(parsed.title));
        }}
      >
        {type === "player" && parseTitles
          ? formatParsedTitle(file.displayName, t)
          : file.displayName}
      </span>

      {file.selected && !file.completed && file.size > 0 && (
        <div className="bg-surface windows95-border ml-1 h-2 w-10 shrink-0">
          <div
            className="bg-secondary h-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, (file.progress_bytes / file.size) * 100)}%`,
            }}
          />
        </div>
      )}

      <span className="text-hint shrink-0">{fmtSize(file.size)}</span>

      {onPriorityChange && type === "torrent" && !file.completed && (
        <Select
          className="w-28"
          value={file.priority || "normal"}
          onChange={(v) => onPriorityChange([file.index], v as FilePriority)}
          options={[
            { value: "normal", label: t("torrent.priority.normal") },
            {
              value: "do_not_download",
              label: t("torrent.priority.skip"),
            },
          ]}
          arrow={false}
        />
      )}

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
