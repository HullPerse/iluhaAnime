import { openPath } from "@tauri-apps/plugin-opener";
import { parse } from "anitomy";
import { cn } from "cn";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";
import type { FilePriority, TorrentTreeFile, TorrentTreeFileWithPath } from "@/types/torrent";

import { PlayerFileActions } from "../actions.torrent";

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
  const setAnilistSearchQuery = useSearchStore((state) => state.setAnilistSearchQuery);
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

          <span className="text-hint shrink-0">{formatBytes(file.size)}</span>

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
