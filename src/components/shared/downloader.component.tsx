import { Button } from "@/components/ui/button.component";
import { ToolInfo } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, Trash2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

export function useToolStatus(toolId: string) {
  const [status, setStatus] = useState<
    "checking" | "installed" | "missing" | "downloading"
  >("checking");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    invoke<boolean>("check_tool_installed", { toolId })
      .then((ok) => {
        setStatus(ok ? "installed" : "missing");
      })
      .catch(() => setStatus("missing"));
  }, [toolId]);

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

  return { status, progress, download, remove, setStatus };
}

function ToolDownloader({ toolId }: { toolId: string }) {
  const { status, progress, download, remove } = useToolStatus(toolId);
  const [info, setInfo] = useState<ToolInfo | null>(null);

  useEffect(() => {
    invoke<ToolInfo[]>("list_available_tools")
      .then((tools) => {
        setInfo(tools.find((t) => t.id === toolId) ?? null);
      })
      .catch(() => {});
  }, [toolId]);

  return (
    <div className="flex items-center gap-2 windows95-text text-[10px]">
      {status === "downloading" && (
        <>
          <span>Загрузка... {progress}%</span>
          <div className="w-20 h-3 windows95-border bg-white">
            <div
              className="h-full bg-highlight"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}
      {status === "missing" && info && (
        <Button
          size="default"
          className="text-[10px] py-0.5 h-auto"
          onClick={download}
        >
          <Download />
          Скачать {info.name}
        </Button>
      )}
      {status === "installed" && (
        <>
          <Button onClick={remove} variant="destructive" className="ml-auto">
            <Trash2 />
            Удалить
          </Button>
          <span className="windows95-text">{info?.name} установлен</span>
        </>
      )}
    </div>
  );
}

export { ToolDownloader };
