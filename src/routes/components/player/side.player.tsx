import { useI18n } from "@/hooks/i18n.hook";
import { useStreamNext } from "@/hooks/player/stream.hook";
import { useAnilistEpisodePreviews } from "@/hooks/stream/catalog.hook";
import { useCell } from "@/lib/signal.hook";
import { ignore } from "@/lib/promise.utils";
import { streamSession } from "@/store/player.store";
import type { PlayerSidePanelProps } from "@/types/player";

import StreamEpisodeList from "./media/episodes.player";
import PlaylistBody from "./media/playlist.player";

/**
 * The side panel is a local playlist for files and the title's season for a
 * stream. A stream has no mpv playlist behind it, so reordering and removing
 * would have nothing to act on; the episodes are a source resolution instead.
 */
export default function PlayerSidePanel({
  onPlay,
  onRemove,
  onMove,
  focusedIndex,
}: PlayerSidePanelProps) {
  const { t } = useI18n();
  const session = useCell(streamSession);
  const streamEpisode = useStreamNext();
  const previews = useAnilistEpisodePreviews(session?.anilistId);

  return (
    <aside className="windows95-border bg-primary flex w-80 shrink-0 flex-col">
      <div className="windows95-text border-muted flex items-center gap-1 border-b-2 px-1 py-1 text-xs font-bold">
        <span className="px-1">
          {session ? t("player.stream.episodes") : t("player.media.playlist.title")}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {session ? (
          <StreamEpisodeList
            episodes={streamEpisode.episodes}
            currentId={session.episodeId}
            previews={previews}
            fallbackCover={session.cover ?? null}
            loading={streamEpisode.episodesLoading}
            onPick={(episode) => ignore(streamEpisode.goTo(episode))}
          />
        ) : (
          <PlaylistBody
            onMove={onMove}
            onPlay={onPlay}
            onRemove={onRemove}
            focusedIndex={focusedIndex}
          />
        )}
      </div>
    </aside>
  );
}
