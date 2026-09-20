import { openPath } from "@tauri-apps/plugin-opener";
import { ChevronDown, ChevronUp, Pause, Play, Check, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TorrentItemProps } from "@/types/torrent";

export function TorrentHeader({
  item,
  selected,
  onSelectChange,
  isLive,
  isPaused,
  busy,
  queue,
  onPause,
  onResume,
  onSeedChange,
  onSetSequential,
  onRecheck,
  onPeers,
  onDelete,
}: Pick<
  TorrentItemProps,
  | "item"
  | "selected"
  | "onSelectChange"
  | "queue"
  | "onPause"
  | "onResume"
  | "onSeedChange"
  | "onSetSequential"
  | "onRecheck"
> & {
  isLive: boolean;
  isPaused: boolean;
  busy: boolean;
  onPeers: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="flex flex-row items-center justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Checkbox
          checked={selected}
          onChange={onSelectChange}
          aria-label={t("torrent.select")}
          className="size-3.5"
        />
        <h3
          className="windows95-font line-clamp-1 text-xs leading-tight font-bold"
          title={item.name}
        >
          {item.name}
        </h3>
      </div>
      <div className="flex flex-row items-center gap-1">
        {queue && (
          <>
            <Button
              title={t("torrent.queue.up")}
              aria-label={t("torrent.queue.up")}
              size="icon"
              className="size-6"
              disabled={busy || queue.index <= 0}
              onClick={() => queue.onMove(-1)}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              title={t("torrent.queue.down")}
              aria-label={t("torrent.queue.down")}
              size="icon"
              className="size-6"
              disabled={busy || queue.index >= queue.total - 1}
              onClick={() => queue.onMove(1)}
            >
              <ChevronDown className="size-4" />
            </Button>
          </>
        )}{" "}
        {item.finished ? (
          <label className="flex cursor-pointer items-center gap-0.5 select-none">
            <Checkbox checked={isLive} onChange={onSeedChange} className="size-3" />
            <span className="windows95-text text-xs">{t("torrent.seed")}</span>
          </label>
        ) : (
          <>
            {isLive ? (
              <Button
                title={t("torrent.pause")}
                aria-label={t("torrent.pause")}
                size="icon"
                className="size-6"
                onClick={onPause}
                disabled={busy}
              >
                <Pause className="size-4" />
              </Button>
            ) : isPaused ? (
              <Button
                title={t("torrent.resume")}
                aria-label={t("torrent.resume")}
                size="icon"
                className="size-6"
                onClick={onResume}
                disabled={busy}
              >
                <Play />
              </Button>
            ) : (
              <Button
                title={t("torrent.pause")}
                aria-label={t("torrent.pause")}
                size="icon"
                className="size-6"
                disabled
              >
                <Pause className="size-4" />
              </Button>
            )}
          </>
        )}
        {item.save_dir && (
          <Button
            title={t("torrent.open.folder")}
            aria-label={t("torrent.open.folder")}
            size="icon"
            className="size-6"
            onClick={() => openPath(item.save_dir)}
          >
            <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4" />
          </Button>
        )}
        <Button
          title={t("torrent.sequential")}
          aria-label={t("torrent.sequential")}
          className="windows95-font flex size-6 items-center justify-center text-xs"
          variant={item.sequential_download ? "default" : "outline"}
          onClick={() => onSetSequential(!item.sequential_download)}
        >
          {item.sequential_download && <Check className="size-4" />}
        </Button>
        <Button
          title={t("torrent.recheck")}
          aria-label={t("torrent.recheck")}
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
          title={t("torrent.peers.open")}
          aria-label={t("torrent.peers.open")}
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            onPeers();
          }}
        >
          <Users className="size-4" />
        </Button>
        <Button
          variant="error"
          title={t("torrent.delete")}
          aria-label={t("torrent.delete")}
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <ImageComponent src="/images/w2k_dustbin.ico" alt="" className="size-4" />
        </Button>
      </div>
    </section>
  );
}
