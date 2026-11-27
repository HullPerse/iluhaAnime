import { useCallback, useEffect, useRef } from "react";

import { streamApi } from "@/api/stream.api";
import { useI18n } from "@/hooks/i18n.hook";
import { emptyPrefs, withQuality, withVariant } from "@/lib/player/streamPrefs.utils";
import { resolvePlayable } from "@/lib/player/streamResolve.utils";
import { openStream } from "@/lib/player/playback.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { toVariantSources } from "@/lib/search/sources.utils";
import { buildWatchKey } from "@/lib/player/streamHelpers.utils";
import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";
import { isEpisodeWatched } from "@/lib/core/anilist/history.utils";
import { sourceOfMediaId, streamSourceConfig } from "@/config/player/streamSources.config";
import { addNotification } from "@/store/notification.store";
import { getStreamProxyUrl, settingsAtoms } from "@/store/settings.store";
import type { StreamHistoryEntry, StreamingEpisode } from "@/types/player/stream";
import type { AnimeLibAnime } from "@/types/player/videoPlayer";

export function useStreamPlayer({
  anime,
  playingId,
  setPlayingId,
}: {
  anime: AnimeLibAnime | undefined;
  playingId: string | null;
  setPlayingId: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const ownerRef = useRef<symbol | null>(null);
  const busyRef = useRef<boolean>(false);
  useEffect(() => {
    ownerRef.current = Symbol(anime?.id);
    busyRef.current = false;

    return () => {
      ownerRef.current = null;
      busyRef.current = false;
    };
  }, [anime?.id]);
  const play = useCallback(
    async (target: StreamingEpisode, entry?: StreamHistoryEntry): Promise<void> => {
      const owner = ownerRef.current;

      if (!anime || playingId || !owner || busyRef.current) return;
      busyRef.current = true;
      setPlayingId(target.id);
      const sourceId = sourceOfMediaId(anime.id);
      const sourceConfig = streamSourceConfig(sourceId);
      const watchKey = buildWatchKey(sourceId, anime.id, target.id);
      const resolved = await resolvePlayable(
        sourceId,
        anime.id,
        target.id,
        watchKey,
        isEpisodeWatched(entry),
        settingsAtoms.streamDefaultQuality.get()
      );

      if (ownerRef.current !== owner) return;

      if (!("playable" in resolved)) {
        addNotification(
          t("stream.playFailed"),
          "error",
          resolved.failure || t("stream.error.noSources")
        );
        busyRef.current = false;
        setPlayingId(null);

        return;
      }

      const { variant, source, sources, variants } = resolved.playable;
      const { prefs, resume } = resolved;
      const base = prefs ?? emptyPrefs(sourceId, anime.id);
      const remembered = withQuality(withVariant(base, variant), source.label);
      const [, prefsFailure] = await attempt(
        streamApi.prefsSave(remembered, ["variantId", "quality"])
      );

      if (ownerRef.current !== owner) return;

      if (prefsFailure) {
        addNotification(t("stream.playFailed"), "error", prefsFailure.message);
      }

      const [, openFailure] = await attempt(
        openStream({
          sourceId,
          sourceName: sourceConfig.name,
          mediaId: anime.id,
          mediaTitle: anime.title,
          slug: anime.slugUrl,
          episodeId: target.id,
          episodeNumber: target.number,
          episodeTitle: target.title ?? "",
          cover: anime.cover,
          anilistId: anime.anilistId ?? null,
          watchKey,
          resume,
          paused: true,
          headers: source.headers,
          proxyUrl: playbackProxyUrl(source.variantId, getStreamProxyUrl(sourceId), source.url),
          quality: source.label,
          variantId: source.variantId,
          sources: toVariantSources(sources),
          variants,
          subtitles: source.subtitles,
          mediaUrl: source.url,
        })
      );

      if (ownerRef.current !== owner) return;
      busyRef.current = false;

      if (openFailure) addNotification(t("stream.playFailed"), "error", openFailure.message);
      setPlayingId(null);
    },
    [anime, playingId, setPlayingId, t]
  );

  return { play };
}
