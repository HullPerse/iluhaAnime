import { Button } from "@/components/ui/button.component";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";

function FFMPEG({
  status,
  setStatus,
}: {
  status: FFMPEGStatus;
  setStatus: (value: FFMPEGStatus) => void;
}) {
  const handleDownload = useCallback(async () => {
    setStatus("downloading");

    try {
      await invoke<string>("download_ffmpeg");
      setStatus("ok");
    } catch {
      setStatus("missing");
    }
  }, [setStatus]);

  const handleRemove = useCallback(async () => {
    try {
      await invoke("remove_ffmpeg");
      setStatus("missing");
    } catch {}
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
      },
    ).then((fn: UnlistenFn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [status]);

  if (status === "checking")
    return (
      <main className="flex flex-row w-full items-center windows95-text gap-1 px-1">
        Проверка на наличие FFmpeg...
      </main>
    );
  if (status === "downloading")
    return (
      <main className="flex flex-row w-full items-stretch windows95-text gap-1 px-1 py-1">
        <span>
          {dlStage === "extracting"
            ? "Извлечение FFmpeg..."
            : "Загрузка FFmpeg..."}
        </span>
        <div className="flex flex-row items-center gap-1 flex-1">
          <div className="flex-1 h-4 windows95-border bg-white">
            <div
              className="h-full bg-secondary"
              style={{
                width:
                  dlProgress && dlProgress.total > 0
                    ? `${(dlProgress.downloaded / dlProgress.total) * 100}%`
                    : "0%",
                transition: "none",
              }}
            />
          </div>
          <span className="text-[10px] w-10 text-right shrink-0">
            {dlProgress && dlProgress.total > 0
              ? `${Math.round((dlProgress.downloaded / dlProgress.total) * 100)}%`
              : "0%"}
          </span>
        </div>
      </main>
    );
  if (status === "missing")
    return (
      <main className="flex flex-row w-full items-center windows95-text gap-1 px-1">
        <span className="windows95-text text-destructive">
          FFmpeg не найден
        </span>
        <Button onClick={handleDownload} className="ml-auto">
          <Download />
          Скачать (~50МБ)
        </Button>
      </main>
    );
  if (status === "ok")
    return (
      <main className="flex flex-row w-full items-center windows95-text gap-1 px-1">
        <span className="windows95-text">FFmpeg установлен</span>
        <Button
          onClick={handleRemove}
          variant="destructive"
          className="ml-auto"
        >
          <Trash2 />
          Удалить
        </Button>
      </main>
    );
}

export default FFMPEG;
