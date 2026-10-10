import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { TorrentView } from "@/types/torrent";

import TorrentFileTree from "./tree.details";

export type DetailsTab = "description" | "screenshots" | "files" | "mediainfo" | "comments";

export function DetailsTabBar({
  tabs,
  activeTab,
  title,
  onSelect,
}: {
  tabs: { id: DetailsTab; label: string; count?: number }[];
  activeTab: DetailsTab;
  title: string;
  onSelect: (tab: DetailsTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label={title}>
      {tabs.map((entry) => (
        <Button
          key={entry.id}
          variant={activeTab === entry.id ? "default" : "ghost"}
          size="default"
          role="tab"
          aria-selected={activeTab === entry.id}
          onClick={() => onSelect(entry.id)}
          disabled={activeTab === entry.id}
        >
          {entry.label}
          {typeof entry.count === "number" ? ` (${entry.count})` : ""}
        </Button>
      ))}
    </div>
  );
}

export function ScreenshotsPanel({
  screenshots,
  onZoom,
}: {
  screenshots: string[];
  onZoom: (url: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
      {screenshots.map((url, index) => (
        <button
          type="button"
          key={`${url}-${index}`}
          className="windows95-border aspect-video min-h-20 cursor-zoom-in bg-black/20 p-0 transition-[filter] hover:brightness-110"
          onClick={() => onZoom(url)}
          title={t("search.details.open.image")}
          aria-label={`${t("search.details.screenshots")} ${index + 1}`}
        >
          <ImageComponent
            src={url}
            alt={`${t("search.details.screenshots")} ${index + 1}`}
            className="h-full w-full"
            type="contain"
          />
        </button>
      ))}
    </div>
  );
}

export function FilesPanel({ view }: { view: TorrentView }) {
  return <TorrentFileTree files={view.files} rootName={view.title} />;
}

export function MediainfoPanel({ mediainfo }: { mediainfo: string }) {
  return (
    <pre className="windows95-border bg-surface max-h-80 overflow-auto p-1.5 font-mono text-xs whitespace-pre-wrap">
      {mediainfo}
    </pre>
  );
}

export function CommentsPanel({ view }: { view: TorrentView }) {
  const { t } = useI18n();
  if (view.comments.length === 0) {
    return (
      <span className="windows95-text text-hint text-xs">{t("search.details.no.comments")}</span>
    );
  }
  return (
    <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto lg:grid-cols-2">
      {view.comments.map((comment, index) => (
        <article
          key={`${comment.author}-${comment.date}-${index}`}
          className="windows95-border bg-surface min-w-0 p-1"
        >
          <div className="windows95-text flex justify-between gap-2 text-xs">
            <strong className="truncate">{comment.author || t("search.details.anonymous")}</strong>
            <span className="text-hint shrink-0">{comment.date}</span>
          </div>
          <p className="windows95-text mt-1 text-xs wrap-break-word whitespace-pre-wrap">
            {comment.text}
          </p>
        </article>
      ))}
    </div>
  );
}
