import { ListVideo, Monitor, Play } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { joinMediaPath, openFileInPlayer } from "@/lib/utils/media.utils";
import { showError } from "@/lib/utils/notification.utils";
import UpscalePlayer from "@/routes/components/player/upscale/modal.upscale";
import type { TorrentTreeFile } from "@/types/torrent";

export function PlayerFileActions({
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
            onClick={async (e) => {
              e.stopPropagation();
              const full = upscaledExtra?.fullPath;
              if (!full) return;
              const [, error] = await attempt(invokeTyped("delete_extra_file", { path: full }));
              if (error) showError(t("common.error"), error.message);
              else onDeleteExtraFile?.();
            }}
            disabled={!upscaledExtra}
          >
            <ImageComponent src="/images/w2k_dustbin.ico" alt="" className="size-4" />
          </Button>

          <QueueStatusIcon status={queueMap.get(fullPath)} />

          <UpscalePlayer filePath={fullPath} onDone={onUpscaleDone} exists={file.exists} />
          {onPlay && (
            <Button
              title={t("player.folder.builtin.player")}
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
            title={t("player.folder.open.media.player")}
            size="icon"
            className="size-4"
            onClick={(e) => {
              e.stopPropagation();
              openFileInPlayer(fullPath);
            }}
            disabled={!file.exists}
          >
            <Monitor className="size-3" />
          </Button>
        </>
      ) : (
        <>
          {path && <QueueStatusIcon status={queueMap.get(joinMediaPath(path, file.name))} />}

          {path && (
            <UpscalePlayer
              filePath={joinMediaPath(path, file.name)}
              exists={file.exists}
              onDone={onUpscaleDone}
            />
          )}
          {path && onPlay && (
            <Button
              title={t("player.folder.builtin.player")}
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
              title={t("player.folder.open.media.player")}
              size="icon"
              className="size-4"
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
        </>
      )}
    </div>
  );
}

function QueueStatusIcon({ status }: { status: string | undefined }) {
  if (status === "queued") return <ListVideo className="text-hint size-3" />;
  if (status === "processing") return <SmallLoader size={3} className="text-highlight" />;
  return null;
}
