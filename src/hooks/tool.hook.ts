import { FFmpeg, ToolState } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

function useToolStatus(toolId: string) {
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

function useFFmpegStatus() {
  const [status, setStatus] = useState<FFmpeg>("checking");
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

export {useToolStatus, useFFmpegStatus};
