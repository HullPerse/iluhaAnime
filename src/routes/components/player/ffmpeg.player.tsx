import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { FFMPEG_SOURCE_SIZES } from "@/config/player/sources.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSettingsStore } from "@/store/settings.store";
import type { FFMPEGStatus } from "@/types/settings";

function FFMPEG({
  status,
  setStatus,
}: {
  status: FFMPEGStatus;
  setStatus: (value: FFMPEGStatus) => void;
}) {
  const ffmpegSource = useSettingsStore((state) => state.ffmpegSource);
  const [dlError, setDlError] = useState<string | null>(null);
  const handleDownload = useCallback(async () => {
    setStatus("downloading");
    setDlError(null);
    try {
      await invokeTyped<string>("download_ffmpeg", {
        source: useSettingsStore.getState().ffmpegSource,
      });
      setStatus("ok");
    } catch (error) {
      setDlError(error instanceof Error ? error.message : String(error));
      setStatus("missing");
    }
  }, [setStatus]);

  const handleRemove = useCallback(async () => {
    try {
      await invokeTyped("remove_ffmpeg");
      setStatus("missing");
    } catch (error) {
      console.warn("remove_ffmpeg failed", error);
    }
  }, [setStatus]);

  const [dlProgress, setDlProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);
  const { t } = useI18n();

  const [dlStage, setDlStage] = useState<string>("");

  useEffect(() => {
    if (status !== "downloading") {
      setDlProgress(null);
      setDlStage("");
      return;
    }
    let unlisten: UnlistenFn;
    listen<{ downloaded: number; total: number; stage: string }>(
      "ffmpeg-download-progress",
      (e: { payload: { downloaded: number; total: number; stage: string } }) => {
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
      }
    ).then((fn: UnlistenFn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [status]);

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
          <div className="windows95-border h-4 flex-1 bg-white">
            <div
              className="bg-secondary h-full"
              style={{
                width:
                  dlProgress && dlProgress.total > 0
                    ? `${(dlProgress.downloaded / dlProgress.total) * 100}%`
                    : "0%",
                transition: "none",
              }}
            />
          </div>
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
        <Button onClick={handleRemove} variant="destructive" className="ml-auto min-h-5.75">
          <Trash2 />
          {t("common.delete")}
        </Button>
      </div>
    );
}

export default FFMPEG;
