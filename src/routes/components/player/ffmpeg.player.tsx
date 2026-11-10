import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { FFMPEG_SOURCE_SIZES } from "@/config/player/playerSources.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { useCell } from "@hullperse/hp_utils/react";
import { attempt } from "@hullperse/hp_utils/attempt";
import { systemApi } from "@/api/system.api";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type { FFMPEGStatus } from "@/types/ui/settings";

function FFMPEG({
  status,
  setStatus,
}: {
  status: FFMPEGStatus;
  setStatus: (value: FFMPEGStatus) => void;
}) {
  const ffmpegSource = useCell(settingsAtoms.ffmpegSource);
  const [dlError, setDlError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<boolean>(false);
  const removingRef = useRef<boolean>(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // FFmpeg found on PATH belongs to the system, so there is no bundled copy to
  // delete; the panel switches to that label instead of failing silently.
  const [systemFfmpeg, setSystemFfmpeg] = useState<boolean>(false);
  const { t } = useI18n();
  const aliveRef = useRef<boolean>(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    []
  );
  const handleDownload = useCallback(async () => {
    setStatus("downloading");
    setDlError(null);
    setRemoveError(null);
    setSystemFfmpeg(false);
    const [, error] = await attempt(systemApi.downloadFfmpeg(settingsAtoms.ffmpegSource.get()));
    if (error) {
      setDlError(error.message);
      setStatus("missing");
    } else setStatus("ok");
    if (!aliveRef.current && settingsAtoms.notifyModelDownloads.get()) {
      if (error) addNotification(t("notification.downloads.failed"), "error", "FFmpeg");
      else addNotification(t("notification.downloads.done"), "success", "FFmpeg");
    }
  }, [setStatus, t]);

  const handleRemove = useCallback(async () => {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    setRemoveError(null);
    const [removed, error] = await attempt(systemApi.removeFfmpeg());
    removingRef.current = false;
    setRemoving(false);
    if (error) {
      setRemoveError(error.message);
      return;
    }
    if (removed) setStatus("missing");
    else setSystemFfmpeg(true);
  }, [setStatus]);

  const [dlProgress, setDlProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);

  const [dlStage, setDlStage] = useState<string>("");

  useEffect(() => {
    if (status !== "downloading") {
      setDlProgress(null);
      setDlStage("");
    }
  }, [status]);

  useTauriEvent<{ downloaded: number; total: number; stage: string }>(
    "ffmpeg-download-progress",
    (e) => {
      if (e.payload.stage === "done") {
        setDlProgress(null);
        setDlStage("done");
      } else {
        setDlProgress({
          downloaded: e.payload.downloaded,
          total: e.payload.total,
        });
        setDlStage(e.payload.stage);
      }
    },
    { enabled: status === "downloading", errorTag: "ffmpeg.download" }
  );

  if (status === "checking")
    return (
      <div className="windows95-text flex min-w-0 flex-1 flex-row items-center gap-1 px-1">
        {t("player.ffmpeg.checking")}
      </div>
    );
  if (status === "downloading")
    return (
      <div className="windows95-text flex min-w-0 flex-1 flex-row items-stretch gap-1 px-1 py-1">
        <span>
          {dlStage === "extracting"
            ? t("player.ffmpeg.extracting")
            : t("player.ffmpeg.downloading")}
        </span>
        <div className="flex flex-1 flex-row items-center gap-1">
          <ProgressBar
            value={dlProgress?.downloaded ?? 0}
            max={dlProgress?.total ?? 0}
            className="h-4 flex-1"
          />
          <span className="w-10 shrink-0 text-right text-xs">
            {dlProgress && dlProgress.total > 0
              ? `${Math.round((dlProgress.downloaded / dlProgress.total) * 100)}%`
              : "0%"}
          </span>
        </div>
      </div>
    );
  if (status === "missing")
    return (
      <div className="windows95-text flex min-w-0 flex-1 flex-row items-center gap-1 px-1">
        <span className="windows95-text text-destructive">{t("player.ffmpeg.missing")}</span>
        {dlError && (
          <span
            className="text-destructive min-w-0 flex-1 truncate text-xs"
            title={t("player.ffmpeg.download.error", { message: dlError })}
          >
            {t("player.ffmpeg.download.error", { message: dlError })}
          </span>
        )}
        <Button onClick={handleDownload} className="ml-auto min-h-5.75">
          <Download />
          {t("player.ffmpeg.download", {
            size: FFMPEG_SOURCE_SIZES[ffmpegSource] ?? 50,
          })}
        </Button>
      </div>
    );
  if (status === "ok")
    return (
      <div className="windows95-text flex min-w-0 flex-1 flex-row items-center gap-1 px-1">
        <span className="windows95-text">{t("player.ffmpeg.installed")}</span>
        {removeError && (
          <span
            className="text-destructive min-w-0 flex-1 truncate text-xs"
            title={t("player.ffmpeg.remove.error", { message: removeError })}
          >
            {t("player.ffmpeg.remove.error", { message: removeError })}
          </span>
        )}
        {systemFfmpeg ? (
          <span className="text-hint ml-auto text-xs">{t("player.ffmpeg.system")}</span>
        ) : (
          <Button
            onClick={handleRemove}
            variant="destructive"
            disabled={removing}
            className="ml-auto min-h-5.75"
          >
            <Trash2 />
            {t("common.delete")}
          </Button>
        )}
      </div>
    );
}

export default FFMPEG;
