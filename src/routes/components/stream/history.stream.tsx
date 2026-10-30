import { ChevronRight, Trash2 } from "lucide-react";

import { streamApi } from "@/api/stream.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { useStreamHistoryRecent } from "@/hooks/stream/catalog.hook";
import { formatResume, isEpisodeWatched, watchShare } from "@/lib/stream/history.utils";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { StreamHistoryEntry } from "@/types/stream";

/**
 * One remembered row. The list is the shape of the AniList tab's rows, not a
 * grid of posters: every line is a title plus the episode that was watched,
 * its progress, and a thumbnail. A history is read top to bottom, and a card
 * grid hides the thing that matters (which episode).
 */
function HistoryRow({ entry, onOpen }: { entry: StreamHistoryEntry; onOpen: () => void }) {
  const { t } = useI18n();
  const cover = useStreamCover(entry.cover);
  const watched = isEpisodeWatched(entry);
  const share = watchShare(entry);
  const episodeLabel = `${t("stream.episode.short", { n: entry.episodeNumber })}${
    entry.episodeTitle ? `, ${entry.episodeTitle}` : ""
  }`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={enterOrSpace(onOpen)}
      title={entry.title}
      className="windows95-text hover:bg-surface flex w-full cursor-pointer items-center gap-2 px-1 py-0.5 text-left select-none"
    >
      <div className="windows95-border bg-field h-10 w-7 shrink-0 overflow-hidden">
        {cover ? (
          <Image src={cover} alt="" className="h-full w-full" type="cover" loading="lazy" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 truncate font-bold">{entry.title}</span>
        <span className="text-hint min-w-0 truncate text-xs">{episodeLabel}</span>
        <div className="bg-surface h-1 w-full">
          <div className="bg-secondary h-1" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      </div>
      <span className={`shrink-0 text-xs tabular-nums ${watched ? "text-hint" : "text-text"}`}>
        {watched
          ? t("stream.history.watched")
          : entry.position > 0
            ? t("stream.episode.resume", { time: formatResume(entry.position) })
            : ""}
      </span>
      <ChevronRight className="text-hint size-3 shrink-0" aria-hidden />
    </div>
  );
}

/**
 * The history modal: the last remembered episodes, newest first, read from the
 * local database. It opens a title through its slug, the same path a deep link
 * takes, so a row is one click away from the episode list.
 */
export default function StreamHistoryModal({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (slug: string) => void;
}) {
  const { t } = useI18n();
  const query = useStreamHistoryRecent(open);
  if (!open) return null;

  const rows = query.data ?? [];
  const clear = () => {
    streamApi
      .historyClear()
      .then(() => query.refetch())
      .catch(() => undefined);
  };

  return (
    <Modal
      header={t("stream.history.title")}
      onClose={onClose}
      className="w-180 max-w-[94%]"
      headerActions={
        rows.length > 0 ? (
          <Button
            size="icon"
            title={t("stream.history.clear")}
            aria-label={t("stream.history.clear")}
            onClick={clear}
          >
            <Trash2 className="size-2.5" />
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <div className="windows95-border bg-field h-40" aria-busy="true" />
      ) : rows.length === 0 ? (
        <p className="text-hint windows95-text p-3 text-center">{t("stream.history.empty")}</p>
      ) : (
        <div
          role="list"
          className="windows95-border bg-field flex max-h-100 min-h-0 flex-col overflow-y-auto p-0.5"
        >
          {rows.map((entry) => (
            <HistoryRow
              key={`${entry.animeId}:${entry.episodeId}`}
              entry={entry}
              onOpen={() => onOpen(entry.slug)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
