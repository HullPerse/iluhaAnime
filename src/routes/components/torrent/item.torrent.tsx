import { memo, useState } from "react";
import type { TorrentInfo, TorrentFileInfo } from "@/types/torrent";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { ConfirmDialog } from "@/components/shared/confirm.component";
import { fmtSize, fmtETA, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { openPath } from "@tauri-apps/plugin-opener";
import TorrentFilesSection from "./file.torrent";
import {
  Pause,
  Play,
  ChevronDown,
  ChevronRight,
  Check,
  RefreshCw,
  ArrowUp,
} from "lucide-react";
import ImageComponent from "@/components/ui/image.component";

interface Props {
  item: TorrentInfo;
  files: TorrentFileInfo[] | undefined;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onPause: () => void;
  onResume: () => void;
  onSeedChange: (enabled: boolean) => void;
  onRemove: (deleteFiles: boolean) => void;
  onUpdateFiles: (indices: number[]) => void;
  onFilePriorityChange: (indices: number[], priority: string) => void;
  onSetSequential: (enabled: boolean) => void;
  onRetry: () => void;
  onRedownload: (fileIndex: number) => void;
}

function TorrentItem({
  item,
  files,
  isExpanded,
  onToggleExpand,
  onPause,
  onResume,
  onSeedChange,
  onRemove,
  onUpdateFiles,
  onFilePriorityChange,
  onSetSequential,
  onRetry,
  onRedownload,
}: Props) {
  const progress = item.progress * 100;
  const isPaused = item.state === "paused";
  const isLive = item.state === "live";
  const [pendingDelete, setPendingDelete] = useState(false);

  return (
    <div className="flex flex-col p-2 windows95-active-border bg-primary gap-2">
      <section className="flex flex-row items-center justify-between">
        <h3 className="line-clamp-1 text-xs font-bold leading-tight windows95-font">
          {item.name}
        </h3>
        <div className="flex flex-row items-center gap-1">
          {item.finished ? (
            <label className="flex items-center gap-0.5 cursor-pointer">
              <Checkbox
                checked={isLive}
                onChange={(v) => onSeedChange(v)}
                className="size-3"
              />
              <span className="windows95-text text-[10px]">Раздавать</span>
            </label>
          ) : (
            <>
              {isLive && (
                <Button
                  title="Поставить на паузу"
                  size="icon"
                  className="size-6"
                  onClick={onPause}
                >
                  <Pause />
                </Button>
              )}
              {isPaused && (
                <Button
                  title="Продолжить скачивание"
                  size="icon"
                  className="size-6"
                  onClick={onResume}
                >
                  <Play />
                </Button>
              )}
            </>
          )}
          {item.save_dir && (
            <Button
              title="Открыть в папке"
              size="icon"
              className="size-6"
              onClick={() => openPath(item.save_dir)}
            >
              <ImageComponent
                src="/images/w2k_folder_closed.ico"
                alt=""
                className="size-4"
              />
            </Button>
          )}
          <Button
            title="Последовательная загрузка"
            className="size-6 text-[9px] windows95-font flex items-center justify-center"
            variant={item.sequential_download ? "default" : "outline"}
            onClick={() => onSetSequential(!item.sequential_download)}
          >
            {item.sequential_download && <Check className="size-4" />}
          </Button>
          <Button
            variant="error"
            title="Удалить торрент"
            size="icon"
            className="size-6"
            onClick={(e) => {
              e.stopPropagation();
              setPendingDelete(true);
            }}
          >
            <ImageComponent
              src="/images/w2k_dustbin.ico"
              alt=""
              className="size-4"
            />
          </Button>
        </div>
      </section>

      <section className="flex flex-row items-start justify-between gap-1 w-full">
        <div className="flex w-full flex-col">
          <ProgressBar
            value={item.progress_bytes}
            max={item.total_bytes}
            className="h-3"
          />
          <div className="flex items-center gap-1">
            <span className="windows95-text text-muted">
              {!item.finished ? stateLabel(item.state) : "Завершено"}
            </span>
            <span className="text-[10px] windows95-font">
              {item.total_bytes > 0
                ? `${fmtSize(item.progress_bytes)} / ${fmtSize(item.total_bytes)} (${progress.toFixed(1)}%)`
                : fmtSize(item.progress_bytes)}
            </span>
            <span className="text-[10px] windows95-font text-muted">
              {fmtSpeed(item.download_speed)}
              {fmtSpeed(item.download_speed) && fmtETA(item.eta_secs) && " · "}
              {fmtETA(item.eta_secs)}
            </span>
            <span className="flex flex-row ml-auto">
              {(item.upload_speed > 0 ||
                item.uploaded_bytes > 0 ||
                item.peers_connected > 0) && (
                <div className="flex items-center gap-1">
                  {item.upload_speed > 0 && (
                    <span className="text-[10px] text-muted windows95-font">
                      <ArrowUp className="size-2.5 inline" />{" "}
                      {fmtSpeed(item.upload_speed)}
                    </span>
                  )}
                  {item.uploaded_bytes > 0 && (
                    <span className="text-[10px] text-muted windows95-font">
                      <ArrowUp className="size-2.5 inline" />{" "}
                      {fmtSize(item.uploaded_bytes)}
                    </span>
                  )}
                  <span className="text-[10px] text-muted windows95-font">
                    P: {item.peers_connected}
                  </span>
                </div>
              )}
            </span>
          </div>
        </div>
      </section>

      {files && (
        <section>
          <div
            role="button"
            className="flex items-center gap-1 windows95-text cursor-pointer hover:bg-surface px-0.5 py-0.5 w-full text-left select-none"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            {`Файлы (${files.filter((f) => f.completed).length} / ${files.length})`}
            {files.some((f) => !f.exists) && (
              <span className="text-destructive ml-1">
                · {files.filter((f) => !f.exists).length} отсутствуют
              </span>
            )}
          </div>
          {isExpanded && (
            <TorrentFilesSection
              id={item.id}
              files={files}
              type="torrent"
              onToggle={(_id, indices) => onUpdateFiles(indices)}
              onFilePriorityChange={(_id, indices, p) =>
                onFilePriorityChange(indices, p)
              }
              onResume={isPaused ? onResume : undefined}
              onRedownload={(fileIndex) => onRedownload(fileIndex)}
            />
          )}
        </section>
      )}

      {item.error && (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-[10px] text-destructive windows95-font">
            {item.error}
          </span>
          <Button
            size="icon"
            className="size-4 ml-auto"
            title="Повторить"
            onClick={onRetry}
          >
            <RefreshCw className="size-3" />
          </Button>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title="Удаление торрента"
          message="Удалить скачанные файлы вместе с торрентом?"
          confirmLabel="Удалить с файлами"
          cancelLabel="Оставить файлы"
          variant="destructive"
          onConfirm={() => {
            onRemove(true);
            setPendingDelete(false);
          }}
          onCancel={() => {
            onRemove(false);
            setPendingDelete(false);
          }}
          onClose={() => setPendingDelete(false)}
        />
      )}
    </div>
  );
}

export default memo(TorrentItem, (prev, next) => {
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.progress !== next.item.progress) return false;
  if (prev.item.state !== next.item.state) return false;
  if (prev.item.download_speed !== next.item.download_speed) return false;
  if (prev.item.upload_speed !== next.item.upload_speed) return false;
  if (prev.item.uploaded_bytes !== next.item.uploaded_bytes) return false;
  if (prev.item.total_bytes !== next.item.total_bytes) return false;
  if (prev.item.progress_bytes !== next.item.progress_bytes) return false;
  if (prev.item.finished !== next.item.finished) return false;
  if (prev.item.eta_secs !== next.item.eta_secs) return false;
  if (prev.item.error !== next.item.error) return false;
  if (prev.item.peers_connected !== next.item.peers_connected) return false;
  if (prev.item.sequential_download !== next.item.sequential_download)
    return false;
  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.files !== next.files) return false;
  return true;
});
