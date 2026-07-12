import { Button } from "@/components/ui/button.component";
import { ToolInfo } from "@/types";
import { fmtSize } from "@/lib/torrent.utils";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

type FfmpegState = "checking" | "ok" | "missing" | "downloading";
type ToolState = "checking" | "installed" | "missing" | "downloading";

function useFfmpegStatus() {
  const [status, setStatus] = useState<FfmpegState>("checking");
  const [dlProgress, setDlProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);
  const [dlStage, setDlStage] = useState<string>("");

  useEffect(() => {
    invoke<boolean>("check_ffprobe")
      .then((ok) => setStatus(ok ? "ok" : "missing"))
      .catch(() => setStatus("missing"));
  }, []);

  useEffect(() => {
    if (status !== "downloading") {
      setDlProgress(null);
      setDlStage("");
      return;
    }
    let unlisten: UnlistenFn | undefined;
    listen<{ downloaded: number; total: number; stage: string }>(
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
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [status]);

  const download = useCallback(async () => {
    setStatus("downloading");
    try {
      await invoke<string>("download_ffmpeg");
      setStatus("ok");
    } catch {
      setStatus("missing");
    }
  }, []);

  const remove = useCallback(async () => {
    try {
      await invoke("remove_ffmpeg");
      setStatus("missing");
    } catch {}
  }, []);

  return {
    status: status === "ok" ? ("installed" as const) : status,
    dlProgress,
    dlStage,
    download,
    remove,
  };
}

function useAIToolStatus(toolId: string) {
  const [status, setStatus] = useState<ToolState>("checking");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    invoke<boolean>("check_tool_installed", { toolId })
      .then((ok) => {
        setStatus(ok ? "installed" : "missing");
      })
      .catch(() => setStatus("missing"));
  }, [toolId]);

  useEffect(() => {
    if (status !== "downloading") {
      setProgress(0);
      return;
    }
    let unlisten: UnlistenFn | undefined;
    listen<{ toolId: string; downloaded: number; total: number }>(
      "tool-download-progress",
      (event) => {
        if (event.payload.toolId === toolId && event.payload.total > 0) {
          setProgress(
            Math.round((event.payload.downloaded / event.payload.total) * 100),
          );
        }
      },
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [status, toolId]);

  const download = useCallback(async () => {
    setStatus("downloading");
    setProgress(0);
    const unlisten = await listen<{
      toolId: string;
      downloaded: number;
      total: number;
    }>("tool-download-progress", (event) => {
      if (event.payload.toolId === toolId && event.payload.total > 0) {
        setProgress(
          Math.round((event.payload.downloaded / event.payload.total) * 100),
        );
      }
    });
    try {
      await invoke("download_tool", { toolId });
      setStatus("installed");
    } catch {
      setStatus("missing");
    } finally {
      unlisten();
    }
  }, [toolId]);

  const remove = useCallback(async () => {
    try {
      await invoke("remove_tool", { toolId });
      setStatus("missing");
    } catch {}
  }, [toolId]);

  return { status, progress, dlStage: "", download, remove };
}

export default function ToolStatusCard({ toolId }: { toolId: string }) {
  const isFfmpeg = toolId === "ffmpeg";
  const ffmpegStatus = useFfmpegStatus();
  const aiStatus = useAIToolStatus(toolId);
  const { status, download, remove } = isFfmpeg ? ffmpegStatus : aiStatus;
  const dlProgress = isFfmpeg ? ffmpegStatus.dlProgress : null;
  const dlStage = isFfmpeg ? ffmpegStatus.dlStage : "";
  const progress = isFfmpeg
    ? dlProgress && dlProgress.total > 0
      ? Math.round((dlProgress.downloaded / dlProgress.total) * 100)
      : 0
    : aiStatus.progress;

  const [info, setInfo] = useState<ToolInfo | null>(null);

  useEffect(() => {
    if (isFfmpeg) return;
    invoke<ToolInfo[]>("list_available_tools")
      .then((tools) => {
        setInfo(tools.find((t) => t.id === toolId) ?? null);
      })
      .catch(() => {});
  }, [toolId, isFfmpeg]);

  const toolName = isFfmpeg ? "FFmpeg" : (info?.name ?? toolId);

  const toolSize = isFfmpeg
    ? "~50МБ"
    : info
      ? fmtSize(info.downloadSizeBytes)
      : "";

  if (status === "checking")
    return (
      <main className="flex flex-row w-full items-center windows95-text gap-1 px-1">
        Проверка на наличие {toolName}...
      </main>
    );

  if (status === "downloading")
    return (
      <main className="flex flex-row w-full items-stretch windows95-text gap-1 px-1 py-1">
        <span>
          {dlStage === "extracting"
            ? "Извлечение FFmpeg..."
            : `Загрузка ${toolName}...`}
        </span>
        <div className="flex flex-row items-center gap-1 flex-1">
          <div className="flex-1 h-4 windows95-border bg-white">
            <div
              className="h-full bg-secondary"
              style={{
                width: `${progress}%`,
                transition: "none",
              }}
            />
          </div>
          <span className="text-[10px] w-10 text-right shrink-0">
            {progress}%
          </span>
        </div>
      </main>
    );

  if (status === "missing")
    return (
      <main className="flex flex-row w-full items-center windows95-text gap-1 px-1">
        <span className="windows95-text text-destructive">
          {toolName} не найден
        </span>
        <Button onClick={download} className="ml-auto">
          <Download />
          Скачать ({toolSize})
        </Button>
      </main>
    );

  if (status === "installed")
    return (
      <main className="flex flex-row w-full items-center windows95-text gap-1 px-1">
        <span className="windows95-text">{toolName} установлен</span>
        <Button onClick={remove} variant="destructive" className="ml-auto">
          <Trash2 />
          Удалить
        </Button>
      </main>
    );
}
