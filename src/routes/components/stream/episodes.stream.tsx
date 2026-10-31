import { Check, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { EPISODE_FILTER_THRESHOLD, EPISODE_ROW_KEYBINDS } from "@/config/player/episodes.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { isTextEntryTarget } from "@/lib/core/filterHotkeys.utils";
import { formatResume, isEpisodeWatched } from "@/lib/core/history.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { PreviewAnchor, RowKeyAction } from "@/types/player/episodes.stream";
import type { StreamHistoryEntry, StreamingEpisode } from "@/types/player/stream";

import { EpisodePreview } from "@/routes/components/stream/episodes/preview.episodes";
import { StreamInlineLoading } from "@/routes/components/stream/states/inlineLoading.states";

/**
 * Episodes as dense rows, not a grid of buttons: a 220 episode season has to
 * stay scannable, and the filter has to sit in the header where the count is.
 */
export default function StreamEpisodes({
  episodes,
  isPending,
  error,
  selectedId,
  previews,
  history,
  onPick,
  onRetry,
}: {
  episodes: StreamingEpisode[];
  isPending: boolean;
  error: Error | null;
  selectedId: string | null;
  /** AniList preview art keyed by episode number; absent when the title has none. */
  previews?: ReadonlyMap<number, string>;
  /** Locally remembered rows keyed by episode id: watched marks and resume. */
  history?: ReadonlyMap<string, StreamHistoryEntry>;
  onPick: (episode: StreamingEpisode) => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<string>("");
  const [hover, setHover] = useState<PreviewAnchor | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return episodes;
    return episodes.filter((episode) =>
      `${episode.number} ${episode.title ?? ""}`.toLowerCase().includes(needle)
    );
  }, [episodes, filter]);

  // The highlighted row follows the playing selection, and a filter that hides
  // it sends the ring back to the top instead of leaving it off screen.
  const activeRow = useMemo(() => {
    const selectedIndex = visible.findIndex((episode) => episode.id === selectedId);
    if (selectedIndex !== -1) return selectedIndex;
    return Math.min(activeIndex, Math.max(visible.length - 1, 0));
  }, [activeIndex, selectedId, visible]);

  const focusRow = (index: number) => {
    if (visible.length === 0) return;
    const next = Math.min(Math.max(index, 0), visible.length - 1);
    setActiveIndex(next);
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-stream-episode]");
    rows?.[next]?.focus();
  };

  useResolvedHotkeys<RowKeyAction>(EPISODE_ROW_KEYBINDS, {
    // The season filter lives inside this panel: typing "j" there must not
    // move the ring.
    ignore: (event) =>
      isTextEntryTarget(event.target) ||
      !(event.target instanceof HTMLElement) ||
      !listRef.current?.contains(event.target),
    onAction: (action) => focusRow(activeRow + (action === "row-up" ? -1 : 1)),
  });

  useEffect(() => {
    if (activeIndex >= visible.length) setActiveIndex(0);
  }, [activeIndex, visible.length]);

  const loading = isPending;
  const failed = !loading && error !== null;
  const empty = !loading && !failed && episodes.length === 0;
  const filtered = !loading && !failed && !empty && visible.length === 0;
  const ready = !loading && !failed && !empty && !filtered;

  return (
    <section
      ref={listRef}
      className="windows95-border flex h-100 min-h-0 min-w-0 flex-col overflow-hidden"
    >
      {/* The header stays put while the season scrolls; the count is a second
          line of the same title bar, so it uses the title text tone instead of
          the hint tone that is unreadable on navy. */}
      <header className="bg-secondary text-title-text windows95-text sticky top-0 z-10 flex shrink-0 items-center gap-1 px-1 py-0.5 font-bold">
        <span>{t("stream.episodes")}</span>
        <span className="text-title-text/75 font-normal">
          {t("stream.episodes.count", { count: episodes.length })}
        </span>
        {episodes.length > EPISODE_FILTER_THRESHOLD && (
          <div className="ml-auto flex items-center gap-1">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("stream.episode.search")}
              aria-label={t("stream.episode.search")}
              className="h-5 w-40 text-xs"
              spellCheck={false}
            />
          </div>
        )}
      </header>

      <div className="bg-field min-h-0 flex-1 overflow-y-auto p-0.5">
        {loading && <StreamInlineLoading />}
        {failed && error !== null && (
          <div className="text-destructive windows95-text flex items-center gap-1 p-1" role="alert">
            <span className="min-w-0 flex-1 wrap-break-word">{error.message}</span>
            <Button
              size="icon"
              className="size-5"
              title={t("stream.retry")}
              aria-label={t("stream.retry")}
              onClick={onRetry}
            >
              <RotateCw className="size-3" />
            </Button>
          </div>
        )}
        {empty && (
          <span className="text-hint windows95-text block p-2 text-center">
            {t("stream.episodes.empty")}
          </span>
        )}
        {filtered && (
          <span className="text-hint windows95-text block p-2 text-center">
            {t("stream.episode.none")}
          </span>
        )}
        {ready && (
          visible.map((episode, index) => {
            const selected = episode.id === selectedId;
            const date = episode.airDate?.slice(0, 10) ?? "";
            const preview = previews?.get(episode.number);
            const entry = history?.get(episode.id);
            const watched = isEpisodeWatched(entry);
            const resume = entry && !watched && entry.position > 0 ? entry.position : 0;
            let rowTone = "text-text hover:bg-surface";
            if (selected) rowTone = "bg-secondary text-title-text font-bold";
            else if (watched) rowTone = "text-hint hover:bg-surface";
            return (
              <div
                key={episode.id}
                role="button"
                tabIndex={index === activeRow ? 0 : -1}
                data-stream-episode
                aria-current={selected ? "true" : undefined}
                onFocus={() => setActiveIndex(index)}
                onClick={() => onPick(episode)}
                onKeyDown={enterOrSpace(() => onPick(episode))}
                onMouseEnter={(event) => {
                  if (!preview) {
                    setHover(null);
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setHover({
                    url: preview,
                    rect: {
                      top: rect.top,
                      bottom: rect.bottom,
                      left: rect.left,
                      right: rect.right,
                    },
                  });
                }}
                onMouseLeave={() => setHover(null)}
                title={episode.title ?? t("stream.episodeUntitled")}
                className={`windows95-text flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 text-left select-none ${rowTone}`}
              >
                <span className="w-7 shrink-0 text-right tabular-nums">{episode.number}</span>
                <span className="min-w-0 flex-1 truncate">
                  {episode.title ?? t("stream.episodeUntitled")}
                </span>
                {watched && (
                  <Check
                    className={`size-3 shrink-0 ${selected ? "text-title-text" : "text-hint"}`}
                    aria-label={t("stream.history.watched")}
                  />
                )}
                {resume > 0 && (
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      selected ? "text-title-text/75" : "text-hint"
                    }`}
                  >
                    {formatResume(resume)}
                  </span>
                )}
                {date && (
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      selected ? "text-title-text/75" : "text-hint"
                    }`}
                  >
                    {date}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      {hover && <EpisodePreview anchor={hover} />}
    </section>
  );
}
