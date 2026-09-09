import { openPath } from "@tauri-apps/plugin-opener";
import { Pause, Play, Check, Search } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TorrentItemProps } from "@/types/torrent";

export function TorrentHeader({
  item,
  isLive,
  isPaused,
  busy,
  onPause,
  onResume,
  onSeedChange,
  onSetSequential,
  onRecheck,
  onDelete,
}: Pick<
  TorrentItemProps,
  "item" | "onPause" | "onResume" | "onSeedChange" | "onSetSequential" | "onRecheck"
> & { isLive: boolean; isPaused: boolean; busy: boolean; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-row items-center justify-between">
      <h3 className="windows95-font line-clamp-1 text-xs leading-tight font-bold" title={item.name}>
        {item.name}
      </h3>
      <div className="flex flex-row items-center gap-1">
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
            size="icon"
            className="size-6"
            onClick={() => openPath(item.save_dir)}
          >
            <ImageComponent src="/images/w2k_folder_closed.ico" alt="" className="size-4" />
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
          <ImageComponent src="/images/w2k_dustbin.ico" alt="" className="size-4" />
        </Button>
      </div>
    </section>
  );
}
