import { Check, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { isTextEntryTarget } from "@/lib/filterHotkeys.utils";
import { formatResume, isEpisodeWatched } from "@/lib/history.utils";
import { enterOrSpace } from "@/lib/keyboard.utils";
import type { StreamHistoryEntry, StreamingEpisode } from "@/types/stream";

import { StreamInlineLoading } from "./states.stream";

/** Above this many episodes the list gets a filter field. */
const FILTER_THRESHOLD = 24;

type RowKeyAction = "row-up" | "row-down";

/**
 * The season walks like the player's file tree: one row is a Tab stop, the
 * arrows and j/k move it, Enter opens the focused row (the row's own key
 * handler). Only two actions need a binding; the vertical pair is the whole
 * list.
 */
const ROW_KEYBINDS: ResolvedHotkeyDef<RowKeyAction>[] = [
  { id: "row-up", chord: "ArrowUp", repeat: "hold", keybindId: "tree.move.up" },
  { id: "row-down", chord: "ArrowDown", repeat: "hold", keybindId: "tree.move.down" },
  { id: "row-up", chord: "KeyK", repeat: "hold", keybindId: "tree.move.up" },
  { id: "row-down", chord: "KeyJ", repeat: "hold", keybindId: "tree.move.down" },
];

function airDateLabel(value: string | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

const PREVIEW_WIDTH = 176;
const PREVIEW_HEIGHT = 112;
const PREVIEW_GAP = 8;

export interface PreviewAnchor {
  url: string;
  /** The hovered row, in viewport coordinates. */
  rect: { top: number; bottom: number; left: number; right: number };
}

/**
 * Where the preview goes for a hovered row: always to the left of it, since
 * the episode list is the right column of the modal and the art belongs over
 * the content beside it. It is lifted by half its height so it centres on the
 * row rather than hanging below it, and both edges stay inside the window.
 */
export function previewPosition(
  rect: PreviewAnchor["rect"],
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const left = Math.max(PREVIEW_GAP, rect.left - PREVIEW_WIDTH - PREVIEW_GAP);
  const maxTop = Math.max(PREVIEW_GAP, viewport.height - PREVIEW_HEIGHT - PREVIEW_GAP);
  const rowCenter = (rect.top + rect.bottom) / 2;
  const top = Math.min(Math.max(PREVIEW_GAP, rowCenter - PREVIEW_HEIGHT / 2), maxTop);
  return { left, top };
}

/**
 * The preview of the hovered row. It is portalled to the body because the
 * modal and its panels animate with transforms, and a fixed child of a
 * transformed ancestor is positioned against that ancestor rather than the
 * window, which is what put the popup in the wrong place.
 */
function EpisodePreview({ anchor }: { anchor: PreviewAnchor }) {
  const src = useStreamCover(anchor.url);
  if (!src || typeof document === "undefined") return null;
  const position = previewPosition(anchor.rect, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  return createPortal(
    <div
      data-testid="episode-preview"
      className="windows95-active-border bg-primary pointer-events-none fixed z-50 p-0.5"
      style={position}
    >
      <img src={src} alt="" className="block h-24 w-44 object-cover" />
    </div>,
    document.body
  );
}

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
  const [filter, setFilter] = useState("");
  const [hover, setHover] = useState<PreviewAnchor | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

  useResolvedHotkeys<RowKeyAction>(ROW_KEYBINDS, {
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
        {episodes.length > FILTER_THRESHOLD ? (
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
        ) : null}
      </header>

      <div className="bg-field min-h-0 flex-1 overflow-y-auto p-0.5">
        {isPending ? (
          <StreamInlineLoading />
        ) : error ? (
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
        ) : episodes.length === 0 ? (
          <span className="text-hint windows95-text block p-2 text-center">
            {t("stream.episodes.empty")}
          </span>
        ) : visible.length === 0 ? (
          <span className="text-hint windows95-text block p-2 text-center">
            {t("stream.episode.none")}
          </span>
        ) : (
          visible.map((episode, index) => {
            const selected = episode.id === selectedId;
            const date = airDateLabel(episode.airDate);
            const preview = previews?.get(episode.number);
            const entry = history?.get(episode.id);
            const watched = isEpisodeWatched(entry);
            const resume = entry && !watched && entry.position > 0 ? entry.position : 0;
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
                className={`windows95-text flex w-full cursor-pointer items-center gap-1 px-1 py-0.5 text-left select-none ${
                  selected
                    ? "bg-secondary text-title-text font-bold"
                    : watched
                      ? "text-hint hover:bg-surface"
                      : "text-text hover:bg-surface"
                }`}
              >
                <span className="w-7 shrink-0 text-right tabular-nums">{episode.number}</span>
                <span className="min-w-0 flex-1 truncate">
                  {episode.title ?? t("stream.episodeUntitled")}
                </span>
                {watched ? (
                  <Check
                    className={`size-3 shrink-0 ${selected ? "text-title-text" : "text-hint"}`}
                    aria-label={t("stream.history.watched")}
                  />
                ) : null}
                {resume > 0 ? (
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      selected ? "text-title-text/75" : "text-hint"
                    }`}
                  >
                    {formatResume(resume)}
                  </span>
                ) : null}
                {date ? (
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      selected ? "text-title-text/75" : "text-hint"
                    }`}
                  >
                    {date}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {hover ? <EpisodePreview anchor={hover} /> : null}
    </section>
  );
}
