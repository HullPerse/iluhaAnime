import { Monitor, Play, Search } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useKeybindTitle } from "@/hooks/keybindTitle.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { joinMediaPath, openFileInPlayer } from "@/lib/utils/media.utils";
import { showError } from "@/lib/utils/notification.utils";
import UpscalePlayer from "@/routes/components/player/upscale/modal.upscale";
import type { TorrentTreeFile } from "@/types/torrent";

import { QueueStatusIcon } from "./queueStatusIcon.torrent";

export function PlayerFileActions({
  file,
  fullPath,
  path,
  queueMap,
  extraFiles,
  onDeleteExtraFile,
  onUpscaleDone,
  onPlay,
  onOpenInApp,
  track,
  onSearch,
}: {
  file: TorrentTreeFile;
  fullPath: string | undefined;
  path?: string;
  queueMap: Map<string, string>;
  extraFiles?: { name: string; size: number; fullPath: string }[];
  onDeleteExtraFile?: () => void;
  onUpscaleDone?: () => void;
  onPlay?: (path: string, name: string) => void;
  onOpenInApp?: (fullPath: string) => void;
  track?: boolean;
  onSearch?: () => void;
}) {
  const { t } = useI18n();
  const builtinTitle = useKeybindTitle(t("player.folder.builtin.player"), "tree.builtin");
  const externalTitle = useKeybindTitle(t("player.folder.open.media.player"), "tree.external");
  const searchTitle = useKeybindTitle(t("player.folder.search.anilist"), "tree.search");
  const upscaledExtra = extraFiles?.find((e) => e.name === file.displayName);
  const resolvedForQueue = fullPath ?? (path ? joinMediaPath(path, file.name) : undefined);
  const queueStatus = resolvedForQueue ? queueMap.get(resolvedForQueue) : undefined;
  const busy = queueStatus === "queued" || queueStatus === "processing";
  const searchDisabled = track === true || busy;

  return (
    <div className="ml-auto flex flex-row gap-1">
      {fullPath ? (
        <>
          <Button
            rendered={!!upscaledExtra}
            title={t("common.delete")}
            size="icon"
            className="size-4"
            onClick={async (e) => {
              e.stopPropagation();
              const full = upscaledExtra?.fullPath;
              if (!full) return;
              const [, error] = await attempt(invokeTyped("delete_extra_file", { path: full }));
              if (error) showError(t("common.error"), error.message);
              else onDeleteExtraFile?.();
            }}
          >
            <ImageComponent src="/images/w2k_dustbin.ico" alt="" className="size-4" />
          </Button>

          <QueueStatusIcon status={queueMap.get(fullPath)} />

          <span data-file-action="upscale" className="contents">
            <UpscalePlayer filePath={fullPath} onDone={onUpscaleDone} exists={file.exists} />
          </span>
          {(onPlay || onOpenInApp) && (
            <Button
              title={builtinTitle}
              size="icon"
              className="size-4"
              data-file-action="builtin"
              onClick={(e) => {
                e.stopPropagation();
                if (onPlay) onPlay(fullPath, file.displayName);
                else onOpenInApp?.(fullPath);
              }}
              disabled={!file.exists}
            >
              <Play className="size-3" />
            </Button>
          )}
          <Button
            title={externalTitle}
            size="icon"
            className="size-4"
            data-file-action="external"
            onClick={(e) => {
              e.stopPropagation();
              openFileInPlayer(fullPath);
            }}
            disabled={!file.exists}
          >
            <Monitor className="size-3" />
          </Button>
          {onSearch && (
            <Button
              title={searchTitle}
              aria-label={t("player.folder.search.anilist")}
              size="icon"
              className="size-4"
              data-file-action="search"
              onClick={(e) => {
                e.stopPropagation();
                onSearch();
              }}
              disabled={searchDisabled}
            >
              <Search className="size-3" />
            </Button>
          )}
        </>
      ) : (
        <>
          {path && <QueueStatusIcon status={queueMap.get(joinMediaPath(path, file.name))} />}

          {path && (
            <span data-file-action="upscale" className="contents">
              <UpscalePlayer
                filePath={joinMediaPath(path, file.name)}
                exists={file.exists}
                onDone={onUpscaleDone}
              />
            </span>
          )}
          {path && (onPlay || onOpenInApp) && (
            <Button
              title={builtinTitle}
              size="icon"
              className="size-4"
              data-file-action="builtin"
              onClick={(e) => {
                e.stopPropagation();
                if (onPlay) onPlay(joinMediaPath(path, file.name), file.displayName);
                else if (path) onOpenInApp?.(joinMediaPath(path, file.name));
              }}
              disabled={!file.exists}
            >
              <Play className="size-3" />
            </Button>
          )}
          {path && (
            <Button
              title={externalTitle}
              size="icon"
              className="size-4"
              data-file-action="external"
              onClick={(e) => {
                e.stopPropagation();
                if (path) {
                  openFileInPlayer(joinMediaPath(path, file.name));
                }
              }}
              disabled={!file.exists}
            >
              <Monitor className="size-3" />
            </Button>
          )}
          {path && onSearch && (
            <Button
              title={searchTitle}
              aria-label={t("player.folder.search.anilist")}
              size="icon"
              className="size-4"
              data-file-action="search"
              onClick={(e) => {
                e.stopPropagation();
                onSearch();
              }}
              disabled={searchDisabled}
            >
              <Search className="size-3" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
