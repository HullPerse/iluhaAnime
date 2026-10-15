import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { Copy, Link, Save } from "lucide-react";

import ContextMenu from "@/components/shared/contextMenu.component";
import type { ContextMenuEntry } from "@/components/shared/contextMenu.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatSize } from "@/lib/search/format.utils";
import { attempt } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { showError } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
import TorrentActions from "@/routes/components/search/default/actions.search";
import type { Source } from "@/types/search";
import type { Anime, TorrentView } from "@/types/torrent";

import { MetaItem } from "./meta.details";

const POSTER_COPY_URL_RE = /^https?:\/\/(?!asset\.localhost)/i;

function canCopyPosterUrl(poster: string): boolean {
  return POSTER_COPY_URL_RE.test(poster);
}

async function posterPngBlob(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`poster fetch failed: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d canvas context");
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("png encode failed");
    return png;
  } finally {
    bitmap.close();
  }
}

export default function DetailsHero({
  view,
  item,
  source,
  busy,
  poster,
  hidePoster = false,
  onCopyMagnet,
  onOpenMagnet,
  onDownload,
  onOpenOriginal,
  onZoom,
}: {
  view: TorrentView;
  item: Anime;
  source: Source;
  busy: boolean;
  poster: string | null;
  hidePoster?: boolean;
  onCopyMagnet: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  onOpenOriginal: () => void;
  onZoom: (url: string) => void;
}) {
  const { t } = useI18n();

  const posterSrc: string | null = hidePoster ? null : poster;

  const copyPosterUrl = (): void => {
    if (!posterSrc) return;
    ignore(
      attempt(writeText(posterSrc)).then(([, error]) => {
        if (error) showError(t("common.error"), t("screenshot.copy.error"));
      })
    );
  };

  const copyPosterImage = (): void => {
    if (!posterSrc) return;
    const src = posterSrc;
    ignore(
      attempt(posterPngBlob(src)).then(([blob, fetchError]) => {
        if (fetchError || !blob) {
          showError(t("common.error"), t("screenshot.copy.error"));
          return;
        }
        ignore(
          attempt(navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])).then(
            ([, writeError]) => {
              if (writeError) showError(t("common.error"), t("screenshot.copy.error"));
            }
          )
        );
      })
    );
  };

  const savePosterImage = (): void => {
    if (!posterSrc) return;
    const src = posterSrc;
    ignore(
      attempt(posterPngBlob(src)).then(([blob, fetchError]) => {
        if (fetchError || !blob) {
          showError(t("common.error"), t("screenshot.save.error"));
          return;
        }
        ignore(
          (async () => {
            const base = src.split("?")[0]?.split("/").pop()?.trim() || "poster";
            const [picked, dialogError] = await attempt(
              save({
                defaultPath: `${base}.png`,
                filters: [{ name: "PNG images", extensions: ["png"] }],
              })
            );
            if (dialogError || !picked) {
              if (dialogError) showError(t("common.error"), t("screenshot.save.error"));
              return;
            }
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const [, saveError] = await attempt(
              invokeTyped("save_poster_bytes", { data: [...bytes], path: picked })
            );
            if (saveError) showError(t("common.error"), t("screenshot.save.error"));
          })()
        );
      })
    );
  };

  const posterMenuEntries: ContextMenuEntry[] = [
    {
      kind: "item",
      id: "save",
      label: "search.details.image.save",
      icon: Save,
      onSelect: savePosterImage,
    },
    {
      kind: "item",
      id: "copy",
      label: "search.details.image.copy",
      icon: Copy,
      onSelect: copyPosterImage,
    },
  ];
  if (posterSrc && canCopyPosterUrl(posterSrc)) {
    posterMenuEntries.push({
      kind: "item",
      id: "copy-url",
      label: "search.details.image.copy.url",
      icon: Link,
      onSelect: copyPosterUrl,
    });
  }

  return (
    <div className="windows95-border bg-surface flex flex-col gap-2 p-1.5 sm:flex-row">
      {!hidePoster && poster ? (
        <ContextMenu entries={posterMenuEntries}>
          <button
            type="button"
            className="border-muted h-52 w-full shrink-0 cursor-zoom-in border p-0 hover:brightness-110 sm:w-36"
            onClick={() => onZoom(poster)}
            title={t("search.details.open.image")}
            aria-label={t("search.details.open.image")}
          >
            <ImageComponent src={poster} alt="" className="h-full w-full object-cover" />
          </button>
        </ContextMenu>
      ) : hidePoster ? null : (
        <div className="border-muted h-52 w-full shrink-0 border sm:w-36" aria-hidden>
          <ImageComponent
            src="/images/unknown_source.png"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="windows95-text text-hint text-xs break-all">
          {view.category}
          {view.author ? ` · ${t("search.details.author")}: ${view.author}` : ""}
        </p>
        <h2 className="windows95-text mt-0.5 text-sm font-bold wrap-break-word">
          {view.title || item.title}
        </h2>
        <p className="windows95-text text-hint mt-0.5 text-xs break-all">
          {source} - {view.url || item.link}
        </p>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
          <MetaItem label={t("search.details.size")} value={formatSize(view.size) || "-"} />
          <MetaItem
            label={t("search.details.seeders")}
            value={<span className="text-success">{view.seeders}</span>}
          />
          <MetaItem
            label={t("search.details.leechers")}
            value={<span className="text-destructive">{view.leechers}</span>}
          />
          {source === "rutracker" ? (
            <MetaItem
              label={t("search.details.downloads")}
              value={view.downloads > 0 ? view.downloads.toLocaleString() : "-"}
            />
          ) : (
            <MetaItem label={t("search.details.completed")} value={view.completed} />
          )}
          <MetaItem label={t("search.details.category")} value={view.category || "-"} />
          <MetaItem label={t("search.details.added")} value={view.uploadedAt || "-"} />
          <MetaItem label={t("search.details.updated")} value={view.updatedAt || "-"} />
        </div>
        <div className="mt-1">
          <TorrentActions
            item={item}
            busy={busy}
            onCopyMagnet={onCopyMagnet}
            onOpenMagnet={onOpenMagnet}
            onDownload={onDownload}
            onOpenOriginal={onOpenOriginal}
            label={view.title || item.title}
          />
        </div>
      </div>
    </div>
  );
}
