import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";
import { Button } from "@/components/ui/button.component";
import { openPath } from "@tauri-apps/plugin-opener";
import TorrentFilesSection from "../torrent/file.torrent";
import { ChevronDown, ChevronRight, FolderOpen, Loader, RefreshCw } from "lucide-react";

interface Props {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  isExpanded: boolean;
  torrentLoading: boolean;
  onToggleExpand: () => void;
}

export default function TorrentFilesPlayerSection({
  item,
  files,
  isExpanded,
  torrentLoading,
  onToggleExpand,
}: Props) {
  const [extraFiles, setExtraFiles] = useState<
    { name: string; size: number; fullPath: string }[]
  >([]);

  const scan = useCallback(() => {
    if (!item.save_dir) return;
    invoke<{ path: string; name: string; size: number }[]>(
      "scan_upscaled_files",
      { path: item.save_dir },
    )
      .then((result) =>
        setExtraFiles(
          result.map((f) => ({ name: f.name, size: f.size, fullPath: f.path })),
        ),
      )
      .catch(() => setExtraFiles([]));
  }, [item.save_dir]);

  useEffect(() => {
    scan();
  }, [scan]);

  const handleUpscaleDone = useCallback(
    (_filePath: string) => {
      scan();
    },
    [scan],
  );

  const handleDeleteExtraFile = useCallback(() => {
    scan();
  }, [scan]);

  return (
    <section className="flex flex-col windows95-active-border bg-primary gap-1">
      <div className="flex items-center gap-1 bg-secondary text-white px-1">
        <span className="flex-1 line-clamp-1 font-bold windows95-text py-0.5">
          {item.name}
        </span>
      </div>

      {torrentLoading && !files ? (
        <div className="flex items-center gap-1 px-0.5 py-0.5 windows95-text">
          <Loader className="size-3 animate-spin" />
          <span className="text-xs">Загрузка файлов...</span>
        </div>
      ) : files ? (
        <section className="flex flex-col gap-1">
          <div
            role="button"
            className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            Файлы: ({files.filter((f) => f.completed).length}){" "}
            {extraFiles.length > 0 && `+ ${extraFiles.length} апскейл`}
            {files.some((f) => !f.exists) && (
              <span className="text-destructive ml-1">
                · {files.filter((f) => !f.exists).length} отсутствуют
              </span>
            )}
            <Button
              size="icon"
              className="ml-auto size-5"
              title="Обновить апскейлы"
              onClick={(e) => {
                e.stopPropagation();
                scan();
              }}
            >
              <RefreshCw className="size-3" />
            </Button>
            <Button
              size="icon"
              className="size-5"
              title="Открыть в папке"
              onClick={(e) => {
                e.stopPropagation();
                openPath(item.save_dir);
              }}
            >
              <FolderOpen />
            </Button>
          </div>
          {isExpanded && (
            <TorrentFilesSection
              id={item.id}
              files={files.filter((f) => f.completed)}
              type="player"
              path={item.save_dir}
              extraFiles={extraFiles}
              onUpscaleDone={handleUpscaleDone}
              onDeleteExtraFile={handleDeleteExtraFile}
            />
          )}
        </section>
      ) : null}

      {item.error && (
        <span className="flex w-full items-center gap-1 text-destructive windows95-text">
          {item.error}
        </span>
      )}
    </section>
  );
}
