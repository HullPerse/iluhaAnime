import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/i18n";
import { useSettingsStore } from "@/store/settings.store";
import type { FFMPEGStatus } from "@/types/settings";

function FastembedDownload({
  status,
  setStatus,
}: {
  status: FFMPEGStatus;
  setStatus: (value: FFMPEGStatus) => void;
}) {
  const fastembedSource = useSettingsStore((state) => state.fastembedSource);
  const [error, setError] = useState<string | null>(null);
  const handleDownload = useCallback(async () => {
    setStatus("downloading");
    setError(null);
    try {
      await invoke<string>("download_fastembed", {
        source: useSettingsStore.getState().fastembedSource,
      });
      setStatus("ok");
    } catch (e) {
      setError(String(e));
      setStatus("missing");
    }
  }, [setStatus]);

  const handleRemove = useCallback(async () => {
    try {
      await invoke("remove_fastembed");
      setStatus("missing");
    } catch {}
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
      "fastembed-download-progress",
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
      <main className="windows95-text flex min-w-0 flex-1 flex-row items-center gap-1 px-1">
        {t("player.fastembed.checking")}
      </main>
    );
  if (status === "downloading")
    return (
      <main className="windows95-text flex min-w-0 flex-1 flex-row items-stretch gap-1 px-1 py-1">
        <span>
          {dlStage === "extracting"
            ? t("player.fastembed.extracting")
            : t("player.fastembed.downloading")}
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
      </main>
    );
  if (status === "missing")
    return (
      <main className="windows95-text flex min-w-0 flex-1 flex-col gap-1 px-1">
        <div className="flex min-w-0 flex-1 flex-row items-center gap-1">
          <span className="windows95-text text-destructive">{t("player.fastembed.missing")}</span>
          <span className="windows95-text text-hint ml-1 text-xs">
            {fastembedSource === "full" ? "80MB" : "30MB"}{" "}
            {fastembedSource === "full"
              ? t("settings.fastembed.source.full")
              : t("settings.fastembed.source.q")}
          </span>
          <Button onClick={handleDownload} className="ml-auto min-h-5.75">
            <Download />
            {t("player.fastembed.download", {
              size: fastembedSource === "full" ? "80" : "30",
            })}
          </Button>
        </div>
        {error && <span className="windows95-text text-destructive text-xs">{error}</span>}
      </main>
    );
  if (status === "ok")
    return (
      <main className="windows95-text flex min-w-0 flex-1 flex-row items-center gap-1 px-1">
        <span className="windows95-text">{t("player.fastembed.installed")}</span>
        <Button onClick={handleRemove} variant="destructive" className="ml-auto min-h-5.75">
          <Trash2 />
          {t("common.delete")}
        </Button>
      </main>
    );
}

export default FastembedDownload;
