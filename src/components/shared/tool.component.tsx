import { Button } from "@/components/ui/button.component";
import { useToolStatus, useFFmpegStatus } from "@/hooks/tool.hook";
import { fmtSize } from "@/lib/torrent.utils";
import { ToolInfo } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { Download, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";

export function ToolStatus({ toolId }: { toolId: string }) {
  const ffmpegStatus = useFFmpegStatus();
  const aiStatus = useToolStatus(toolId);

  const isFfmpeg = toolId === "ffmpeg";

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
        <Button onClick={download} className="ml-auto w-32">
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

  return null;
}

export default ToolStatus;
