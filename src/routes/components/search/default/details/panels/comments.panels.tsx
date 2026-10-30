import { useI18n } from "@/hooks/i18n.hook";
import type { TorrentView } from "@/types/torrent/torrent";

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
