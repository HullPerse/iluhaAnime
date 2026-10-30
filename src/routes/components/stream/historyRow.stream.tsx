import { ChevronRight } from "lucide-react";

import Image from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { formatResume, isEpisodeWatched, watchShare } from "@/lib/core/history.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { StreamHistoryEntry } from "@/types/player/stream";

export function HistoryRow({ entry, onOpen }: { entry: StreamHistoryEntry; onOpen: () => void }) {
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
