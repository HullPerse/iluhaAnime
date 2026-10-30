import { useEffect, useMemo, useState } from "react";

import { useAnilistSignedIn } from "@/hooks/anilist/session.hook";
import { useStreamEpisodeSelection } from "@/hooks/stream/episodeSelection.hook";
import { useStreamPlayer } from "@/hooks/stream/playback.hook";
import {
  useAnilistEpisodePreviews,
  useStreamHistoryForAnime,
  useStreamTitle,
} from "@/hooks/stream/catalog.hook";
import { attempt } from "@/lib/core/attempt.utils";
import { historyByEpisode } from "@/lib/core/history.utils";
import { prewarmPlayer } from "@/lib/player/playback.utils";
import { ignore } from "@/lib/core/promise.utils";
import { prefetchEpisode } from "@/lib/player/streamResolve.utils";
import { streamStore } from "@/store/stream.store";
import type { StreamHistoryEntry, StreamingEpisode } from "@/types/player/stream";

import AniListDetailModal from "@/routes/components/anilist/detail/modal.detail";
import { StreamDetailView } from "@/routes/components/stream/detail/view.detail";

export default function StreamDetail({ slug }: { slug: string }) {
  const title = useStreamTitle(slug);
  const anime = title.data?.anime;
  const episodes = title.data?.episodes;
  const previews = useAnilistEpisodePreviews(anime?.anilistId);
  const signedIn = useAnilistSignedIn();
  const historyQuery = useStreamHistoryForAnime(anime?.id ?? null);
  const history = useMemo(() => historyByEpisode(historyQuery.data ?? []), [historyQuery.data]);
  const latestEpisodeId = useMemo(() => {
    let latest: StreamHistoryEntry | null = null;
    for (const row of historyQuery.data ?? []) {
      if (!latest || row.updatedAt > latest.updatedAt) latest = row;
    }
    return latest?.episodeId ?? null;
  }, [historyQuery.data]);
  const [anilistOpen, setAnilistOpen] = useState(false);
  const [episode, setEpisode] = useStreamEpisodeSelection(episodes, latestEpisodeId);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { play } = useStreamPlayer({ anime, playingId, setPlayingId });

  const close = () => streamStore.selectedSlug.set(null);

  useEffect(() => {
    ignore(attempt(prewarmPlayer()).then(() => undefined));
  }, []);

  const animeId = anime?.id ?? null;
  const episodeIndex = useMemo(() => {
    if (!episodes || episodes.length === 0) return -1;
    const index = episode ? episodes.findIndex((candidate) => candidate.id === episode.id) : 0;
    return index === -1 ? 0 : index;
  }, [episode, episodes]);
  const neighbourIds = useMemo(() => {
    if (!episodes) return [];
    return [episodes[episodeIndex - 1], episodes[episodeIndex + 1]]
      .filter((candidate): candidate is StreamingEpisode => candidate !== undefined)
      .map((candidate) => candidate.id);
  }, [episodeIndex, episodes]);
  useEffect(() => {
    if (!animeId) return;
    for (const neighbourId of neighbourIds) ignore(prefetchEpisode(animeId, neighbourId));
  }, [animeId, neighbourIds]);

  if (anilistOpen && anime?.anilistId) {
    return (
      <AniListDetailModal
        animeId={anime.anilistId}
        isLoggedIn={signedIn}
        onTag={() => undefined}
        onGenre={() => undefined}
        onBack={() => setAnilistOpen(false)}
        onClose={close}
      />
    );
  }

  return (
    <StreamDetailView
      anime={anime}
      episode={episode}
      episodes={episodes}
      onClose={close}
      onOpenAnilist={() => setAnilistOpen(true)}
      onPick={(picked) => {
        setEpisode(picked);
        ignore(play(picked, history.get(picked.id)));
      }}
      playingId={playingId}
      previews={previews}
      history={history}
      slug={slug}
      signedIn={signedIn}
      title={title}
    />
  );
}
