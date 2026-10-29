import { RotateCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { useStreamCover } from "@/hooks/remoteImage.hook";
import { enterOrSpace } from "@/lib/utils/keyboard.utils";
import type { StreamingEpisode } from "@/types/stream";

import { StreamInlineLoading } from "./states.stream";

/** Above this many episodes the list gets a filter field. */
const FILTER_THRESHOLD = 24;

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
  onPick,
  onRetry,
}: {
  episodes: StreamingEpisode[];
  isPending: boolean;
  error: Error | null;
  selectedId: string | null;
  /** AniList preview art keyed by episode number; absent when the title has none. */
  previews?: ReadonlyMap<number, string>;
  onPick: (episode: StreamingEpisode) => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [hover, setHover] = useState<PreviewAnchor | null>(null);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return episodes;
    return episodes.filter((episode) =>
      `${episode.number} ${episode.title ?? ""}`.toLowerCase().includes(needle)
    );
  }, [episodes, filter]);

  return (
    <section className="windows95-border flex h-100 min-h-0 min-w-0 flex-col overflow-y-auto">
      <header className="bg-secondary text-title-text windows95-text flex shrink-0 items-center gap-1 px-1 py-0.5 font-bold">
        <span>{t("stream.episodes")}</span>
        <span className="text-hint font-normal">
          {t("stream.episodes.count", { count: episodes.length })}
        </span>
        {episodes.length > FILTER_THRESHOLD ? (
          <div className="ml-auto flex items-center gap-1">
            <Search className="text-hint size-3 shrink-0" aria-hidden />
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
            <span className="min-w-0 flex-1 break-words">{error.message}</span>
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
          visible.map((episode) => {
            const selected = episode.id === selectedId;
            const date = airDateLabel(episode.airDate);
            const preview = previews?.get(episode.number);
            return (
              <div
                key={episode.id}
                role="button"
                tabIndex={0}
                aria-current={selected ? "true" : undefined}
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
                  selected ? "bg-secondary text-title-text font-bold" : "text-text hover:bg-surface"
                }`}
              >
                <span className="w-7 shrink-0 text-right tabular-nums">{episode.number}</span>
                <span className="min-w-0 flex-1 truncate">
                  {episode.title ?? t("stream.episodeUntitled")}
                </span>
                {date ? (
                  <span className="text-hint shrink-0 text-xs tabular-nums">{date}</span>
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
