import { Clipboard, Download, ExternalLink, Link2, Magnet } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { Anime } from "@/types/torrent";

function ActionSeparator() {
  return <span className="ui-toolbar-separator" aria-hidden />;
}

export default function TorrentActions({
  item,
  busy,
  onCopyMagnet,
  onCopyLink,
  onOpenMagnet,
  onDownload,
  onOpenOriginal,
  label,
}: {
  item: Anime;
  busy: boolean;
  onCopyMagnet: (item: Anime) => void;
  onCopyLink?: (item: Anime) => void;
  onOpenMagnet: (item: Anime) => void;
  onDownload: (item: Anime) => void;
  onOpenOriginal?: () => void;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className="windows95-border bg-surface flex flex-wrap items-center gap-1 p-1"
      role="toolbar"
      aria-label={label}
    >
      <Button
        size="icon"
        onClick={() => onCopyMagnet(item)}
        disabled={busy}
        title={t("search.details.copy")}
        aria-label={t("search.details.copy")}
      >
        <Clipboard className="size-3" />
      </Button>
      <Button
        size="icon"
        onClick={() => onOpenMagnet(item)}
        disabled={busy}
        title={t("search.magnet")}
        aria-label={t("search.magnet")}
      >
        <Magnet className="size-3" />
      </Button>
      <Button
        size="icon"
        onClick={() => onDownload(item)}
        disabled={busy}
        title={t("search.download")}
        aria-label={t("search.download")}
      >
        <Download className="size-3" />
      </Button>
      {onCopyLink && (
        <Button
          size="icon"
          onClick={() => onCopyLink(item)}
          disabled={busy}
          title={t("torrent.copy.link")}
          aria-label={t("torrent.copy.link")}
        >
          <Link2 className="size-3" />
        </Button>
      )}
      {onOpenOriginal && (
        <>
          <ActionSeparator />
          <Button
            size="icon"
            onClick={onOpenOriginal}
            title={t("search.details.original")}
            aria-label={t("search.details.original")}
          >
            <ExternalLink className="size-3" />
          </Button>
        </>
      )}
    </div>
  );
}
