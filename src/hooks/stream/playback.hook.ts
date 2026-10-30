import { useCallback } from "react";

import { streamApi } from "@/api/stream.api";
import { useI18n } from "@/hooks/i18n.hook";
import { emptyPrefs, withQuality, withVariant } from "@/lib/player/streamPrefs.utils";
import { SOURCE_ID, SOURCE_NAME, resolvePlayable } from "@/lib/player/streamResolve.utils";
import { openStream } from "@/lib/player/playback.utils";
import { attempt } from "@/lib/core/attempt.utils";
import { toVariantSources } from "@/lib/search/sources.utils";
import { buildWatchKey } from "@/lib/player/streamHelpers.utils";
import { isEpisodeWatched } from "@/lib/core/history.utils";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
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
  const play = useCallback(
    async (target: StreamingEpisode, entry?: StreamHistoryEntry): Promise<void> => {
      if (!anime || playingId) return;
      setPlayingId(target.id);
      const watchKey = buildWatchKey(SOURCE_ID, anime.id, target.id);
      const resolved = await resolvePlayable(
        anime.id,
        target.id,
        watchKey,
        isEpisodeWatched(entry),
        settingsAtoms.streamDefaultQuality.get()
      );
      if (!("playable" in resolved)) {
        addNotification(
          t("stream.playFailed"),
          "error",
          resolved.failure || t("stream.error.noSources")
        );
        setPlayingId(null);
        return;
      }
      const { variant, source, sources, variants } = resolved.playable;
      const { prefs, resume } = resolved;
      const base = prefs ?? emptyPrefs(SOURCE_ID, anime.id);
      const remembered = withQuality(withVariant(base, variant), source.label);
      const [, prefsFailure] = await attempt(streamApi.prefsSave(remembered));
      if (prefsFailure) {
        addNotification(t("stream.playFailed"), "error", prefsFailure.message);
      }
      const [, openFailure] = await attempt(
        openStream({
          sourceId: SOURCE_ID,
          sourceName: SOURCE_NAME,
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
          proxyUrl: settingsAtoms.animelibProxyUrl.get(),
          quality: source.label,
          variantId: source.variantId,
          sources: toVariantSources(sources),
          variants,
          mediaUrl: source.url,
        })
      );
      if (openFailure) addNotification(t("stream.playFailed"), "error", openFailure.message);
      setPlayingId(null);
    },
    [anime, playingId, setPlayingId, t]
  );
  return { play };
}
