import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileDown,
  Pause,
  Play,
  Pencil,
  Search,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { torrentApi } from "@/api/torrent.api";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import ImageComponent from "@/components/ui/image.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useSetTorrentAlias } from "@/hooks/torrent/queries.hook";
import { attempt } from "@/lib/utils/attempt.utils";
import { showError } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
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
  dragHandle,
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
  dragHandle?: ReactNode;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const aliasMutation = useSetTorrentAlias();

  const commitAlias = (value: string | null) => {
    if (!editing) return;
    setEditing(false);
    const trimmed = value?.trim() ?? "";
    if (trimmed === item.name) return;
    aliasMutation.mutate({
      id: item.id,
      alias: trimmed ? trimmed : null,
      infoHash: item.info_hash,
    });
  };

  const exportFile = async () => {
    const target = await saveDialog({
      defaultPath: `${item.name}.torrent`,
      filters: [{ name: "Torrent", extensions: ["torrent"] }],
    });
    if (!target) return;
    const [, error] = await attempt(torrentApi.exportTorrentFile(item.id, target, item.info_hash));
    if (error) showError(t("torrent.export.error"), error.message);
  };

  const copyText = (label: string, value: string) => {
    ignore(
      attempt(writeText(value)).then(([, error]) => {
        if (error) showError(label, error.message);
      })
    );
  };

  return (
    <section className="flex flex-row items-center justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Checkbox
          checked={selected}
          onChange={onSelectChange}
          aria-label={t("torrent.select")}
          className="size-3.5"
        />
        {editing ? (
          <Input
            autoFocus
            value={draft}
            maxLength={200}
            aria-label={t("torrent.rename")}
            className="h-6 min-w-0 flex-1 text-xs"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitAlias(draft);
              else if (event.key === "Escape") setEditing(false);
            }}
            onBlur={() => commitAlias(draft)}
          />
        ) : (
          <h3
            className="windows95-font line-clamp-1 text-xs leading-tight font-bold"
            title={item.name}
          >
            {item.name}
          </h3>
        )}
        {editing ? (
          <Button
            title={t("torrent.rename.clear")}
            aria-label={t("torrent.rename.clear")}
            size="icon"
            className="size-6 shrink-0"
            disabled={aliasMutation.isPending}
            onClick={() => commitAlias(null)}
          >
            <X className="size-4" />
          </Button>
        ) : (
          <Button
            title={t("torrent.rename")}
            aria-label={t("torrent.rename")}
            size="icon"
            className="size-6 shrink-0"
            disabled={busy || aliasMutation.isPending}
            onClick={() => {
              setDraft(item.name);
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex flex-row items-center gap-1">
        {dragHandle}
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
          title={t("torrent.copy.magnet")}
          aria-label={t("torrent.copy.magnet")}
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            copyText(t("torrent.copy.magnet"), `magnet:?xt=urn:btih:${item.info_hash}`);
          }}
        >
          <Copy className="size-4" />
        </Button>
        <Button
          title={t("torrent.copy.infohash")}
          aria-label={t("torrent.copy.infohash")}
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            copyText(t("torrent.copy.infohash"), item.info_hash);
          }}
        >
          <span className="windows95-font text-xs font-bold">#</span>
        </Button>
        <Button
          title={t("torrent.export.file")}
          aria-label={t("torrent.export.file")}
          size="icon"
          className="size-6"
          onClick={(e) => {
            e.stopPropagation();
            ignore(exportFile());
          }}
        >
          <FileDown className="size-4" />
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
