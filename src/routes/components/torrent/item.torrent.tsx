import { openPath } from "@tauri-apps/plugin-opener";
import {
  Pause,
  Play,
  ChevronDown,
  ChevronRight,
  Check,
  RefreshCw,
  ArrowUp,
  Search,
} from "lucide-react";
import { memo, useEffect, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm.component";
import ProgressBar from "@/components/shared/progress.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/lib/i18n";
import { enterOrSpace } from "@/lib/keyboard.utils";
import { fmtSize, fmtETA, fmtSpeed, stateLabel } from "@/lib/torrent.utils";
import { useTorrentStore } from "@/store/download.store";
import type {
  FilePriority,
  TorrentInfo,
  TorrentFileInfo,
} from "@/types/torrent";

import TorrentFilesSection from "./file.torrent";

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
  onFilePriorityChange: (indices: number[], priority: FilePriority) => void;
  onSetSequential: (enabled: boolean) => void;
  onRetry: () => void;
  onRedownload: (fileIndex: number) => void;
  onRecheck: () => void;
}

function TorrentLimitsSection({ id }: { id: number }) {
  const { t } = useI18n();
  const [dlInput, setDlInput] = useState("");
  const [ulInput, setUlInput] = useState("");
  useEffect(() => {
    let cancelled = false;
    useTorrentStore
      .getState()
      .getTorrentLimits(id)
      .then((limits) => {
        if (cancelled) return;
        if (limits.downloadBps !== null)
          setDlInput(String(Math.round(limits.downloadBps / 1024)));
        if (limits.uploadBps !== null)
          setUlInput(String(Math.round(limits.uploadBps / 1024)));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const applyLimits = () => {
    const dl = dlInput === "" ? null : Number(dlInput);
    const ul = ulInput === "" ? null : Number(ulInput);
    if (dl !== null && (!Number.isFinite(dl) || dl <= 0)) return;
    if (ul !== null && (!Number.isFinite(ul) || ul <= 0)) return;
    useTorrentStore.getState().setTorrentLimits(id, dl, ul);
  };
  return (
    <div className="flex flex-row flex-wrap items-center gap-1">
      <span className="windows95-text text-xs">{t("torrent.limits")}</span>
      <Input
        className="h-5 w-16 text-xs"
        placeholder="DL"
        value={dlInput}
        onChange={(e) => setDlInput(e.target.value)}
      />
      <Input
        className="h-5 w-16 text-xs"
        placeholder="UL"
        value={ulInput}
        onChange={(e) => setUlInput(e.target.value)}
      />
      <Button
        size="icon"
        className="size-5"
        title={t("torrent.limits.apply")}
        onClick={applyLimits}
      >
        <Check className="size-3" />
      </Button>
    </div>
  );
}

function TorrentHeader({
  item,
  isLive,
  isPaused,
  onPause,
  onResume,
  onSeedChange,
  onSetSequential,
  onRecheck,
  onDelete,
}: Pick<
  Props,
  | "item"
  | "onPause"
  | "onResume"
  | "onSeedChange"
  | "onSetSequential"
  | "onRecheck"
> & { isLive: boolean; isPaused: boolean; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-row items-center justify-between">
      <h3 className="windows95-font line-clamp-1 text-xs leading-tight font-bold">
        {item.name}
      </h3>
      <div className="flex flex-row items-center gap-1">
        {item.finished ? (
          <label className="flex cursor-pointer items-center gap-0.5">
            <Checkbox
              checked={isLive}
              onChange={onSeedChange}
              className="size-3"
            />
            <span className="windows95-text text-xs">{t("torrent.seed")}</span>
          </label>
        ) : (
          <>
            {isLive && (
              <Button
                title={t("torrent.pause")}
                size="icon"
                className="size-6"
                onClick={onPause}
              >
                <Pause className="size-4" />
              </Button>
            )}
            {isPaused && (
              <Button
                title={t("torrent.resume")}
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
            title={t("torrent.openFolder")}
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
          title={t("torrent.sequential")}
          className="windows95-font flex size-6 items-center justify-center text-xs"
          variant={item.sequential_download ? "default" : "outline"}
          onClick={() => onSetSequential(!item.sequential_download)}
        >
          {item.sequential_download && <Check className="size-4" />}
        </Button>
        <Button
          title={t("torrent.recheck")}
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            onRecheck();
          }}
        >
          <Search className="size-4" />
        </Button>
        <Button
          variant="error"
          title={t("torrent.delete")}
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
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
  );
}

function TorrentProgress({ item }: { item: TorrentInfo }) {
  const { t } = useI18n();
  const progress = item.progress * 100;
  return (
    <section className="flex w-full flex-row items-start justify-between gap-1">
      <div className="flex w-full flex-col">
        <ProgressBar
          value={item.progress_bytes}
          max={item.total_bytes}
          className="h-3"
        />
        <div className="flex items-center gap-1">
          <span className="windows95-text text-hint">
            {item.finished
              ? t("torrent.state.completed")
              : stateLabel(item.state, t)}
          </span>
          <span className="windows95-font text-xs">
            {item.total_bytes > 0
              ? `${fmtSize(item.progress_bytes)} / ${fmtSize(item.total_bytes)} (${progress.toFixed(1)}%)`
              : fmtSize(item.progress_bytes)}
          </span>
          <span className="windows95-font text-hint text-xs">
            {fmtSpeed(item.download_speed)}
            {item.share_ratio > 0 && (
              <span className="ml-1">
                {t("torrent.ratio", { ratio: item.share_ratio.toFixed(2) })}
              </span>
            )}
            {fmtSpeed(item.download_speed) && fmtETA(item.eta_secs, t) && " - "}
            {fmtETA(item.eta_secs, t)}
          </span>
          <span className="ml-auto flex flex-row">
            {(item.upload_speed > 0 ||
              item.uploaded_bytes > 0 ||
              item.peers_connected > 0) && (
              <div className="flex items-center gap-1">
                {item.upload_speed > 0 && (
                  <span className="text-hint windows95-font text-xs">
                    <ArrowUp className="inline size-2.5" />{" "}
                    {fmtSpeed(item.upload_speed)}
                  </span>
                )}
                {item.uploaded_bytes > 0 && (
                  <span className="text-hint windows95-font text-xs">
                    <ArrowUp className="inline size-2.5" />{" "}
                    {fmtSize(item.uploaded_bytes)}
                  </span>
                )}
                <span className="text-hint windows95-font text-xs">
                  P: {item.peers_connected}
                </span>
              </div>
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

function TorrentFiles({
  item,
  files,
  isExpanded,
  onToggleExpand,
  onResume,
  onUpdateFiles,
  onFilePriorityChange,
  onRedownload,
}: {
  item: TorrentInfo;
  files: TorrentFileInfo[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onResume: () => void;
  onUpdateFiles: (indices: number[]) => void;
  onFilePriorityChange: (indices: number[], priority: FilePriority) => void;
  onRedownload: (fileIndex: number) => void;
}) {
  const { t } = useI18n();
  const completed = files.filter((file) => file.completed).length;
  const missing = files.filter((file) => file.completed && !file.exists).length;
  return (
    <section>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={t("torrent.filesCount", {
          done: completed,
          total: files.length,
        })}
        className="windows95-text hover:bg-surface focus-visible:outline-text flex w-full cursor-pointer items-center gap-1 px-0.5 py-0.5 text-left select-none focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
        onClick={onToggleExpand}
        onKeyDown={enterOrSpace(onToggleExpand)}
      >
        {isExpanded ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {t("torrent.filesCount", { done: completed, total: files.length })}
        {missing > 0 && (
          <span className="text-destructive ml-1">
            - {missing} {t("torrent.missing")}
          </span>
        )}
      </div>
      {isExpanded && (
        <>
          <TorrentLimitsSection id={item.id} />
          <TorrentFilesSection
            id={item.id}
            files={files}
            type="torrent"
            onToggle={(_id, indices) => onUpdateFiles(indices)}
            onFilePriorityChange={(_id, indices, priority) =>
              onFilePriorityChange(indices, priority)
            }
            onResume={item.state === "paused" ? onResume : undefined}
            onRedownload={onRedownload}
          />
        </>
      )}
    </section>
  );
}

function TorrentError({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-1 flex items-center gap-1">
      <span className="text-destructive windows95-font text-xs">{error}</span>
      <Button
        size="icon"
        className="ml-auto size-4"
        title={t("torrent.retry")}
        onClick={onRetry}
      >
        <RefreshCw className="size-3" />
      </Button>
    </div>
  );
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
  onRecheck,
}: Props) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const isPaused = item.state === "paused";
  const isLive = item.state === "live";
  const { t } = useI18n();
  return (
    <div className="windows95-active-border bg-primary hover:bg-surface flex flex-col gap-2 p-2">
      <TorrentHeader
        item={item}
        isLive={isLive}
        isPaused={isPaused}
        onPause={onPause}
        onResume={onResume}
        onSeedChange={onSeedChange}
        onSetSequential={onSetSequential}
        onRecheck={onRecheck}
        onDelete={() => setPendingDelete(true)}
      />
      <TorrentProgress item={item} />
      {files && (
        <TorrentFiles
          item={item}
          files={files}
          isExpanded={isExpanded}
          onToggleExpand={onToggleExpand}
          onResume={onResume}
          onUpdateFiles={onUpdateFiles}
          onFilePriorityChange={onFilePriorityChange}
          onRedownload={onRedownload}
        />
      )}
      {item.error && <TorrentError error={item.error} onRetry={onRetry} />}
      {pendingDelete && (
        <ConfirmDialog
          open
          title={t("torrent.deleteTitle")}
          message={t("torrent.deleteMessage")}
          confirmLabel={t("torrent.deleteWithFiles")}
          cancelLabel={t("torrent.keepFiles")}
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

export default memo(
  TorrentItem,
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.progress === next.item.progress &&
    prev.item.state === next.item.state &&
    prev.item.download_speed === next.item.download_speed &&
    prev.item.upload_speed === next.item.upload_speed &&
    prev.item.uploaded_bytes === next.item.uploaded_bytes &&
    prev.item.share_ratio === next.item.share_ratio &&
    prev.item.total_bytes === next.item.total_bytes &&
    prev.item.progress_bytes === next.item.progress_bytes &&
    prev.item.finished === next.item.finished &&
    prev.item.eta_secs === next.item.eta_secs &&
    prev.item.error === next.item.error &&
    prev.item.peers_connected === next.item.peers_connected &&
    prev.item.sequential_download === next.item.sequential_download &&
    prev.isExpanded === next.isExpanded &&
    prev.files === next.files
);
