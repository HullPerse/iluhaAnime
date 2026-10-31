import { useCallback, useEffect, useRef, useState } from "react";

import { streamApi } from "@/api/stream.api";
import { tr } from "@/lib/locale/i18n.utils";
import { useCell } from "@/lib/core/signal.hook";
import { buildVariantId } from "@/lib/player/streamHelpers.utils";
import { emptyPrefs, preferNativeVariants } from "@/lib/player/streamPrefs.utils";
import {
  loadEpisodes,
  loadPlayers,
  loadSources,
  prefetchNativeSources,
} from "@/lib/core/sessionCache.utils";
import { pickSource, toVariantSources, variantSourceUrl } from "@/lib/search/sources.utils";
import { openStream } from "@/lib/player/playback.utils";
import { resolveEpisodeStream, resolveNextStream } from "@/lib/player/playerStream.utils";
import { attempt, reportBackgroundError } from "@/lib/core/attempt.utils";
import { ignore } from "@/lib/core/promise.utils";
import { addNotification } from "@/store/notification.store";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { StreamPrefs, StreamVariant, StreamingEpisode } from "@/types/player/stream";
import type { StreamOpen } from "@/types/player/videoPlayer";
import type { PlayerStream, PlayerStreamNext } from "@/types/player/playerStream";

function currentPosition(): number {
  return playbackAtoms.timePos.get();
}

function fallbackQuality(): string {
  return settingsAtoms.streamDefaultQuality.get();
}

async function rememberPrefs(session: StreamOpen, patch: Partial<StreamPrefs>): Promise<void> {
  const [loaded] = await attempt(streamApi.prefsGet(session.sourceId, session.mediaId));
  const base = loaded ?? emptyPrefs(session.sourceId, session.mediaId);
  const [failure] = await attempt(
    streamApi.prefsSave({ ...base, ...patch, sourceId: session.sourceId, mediaId: session.mediaId })
  );
  if (failure) reportBackgroundError("player.stream.prefs", failure);
}

export function usePlayerStream(): PlayerStream {
  const session = useCell(streamSession);
  const [variants, setVariants] = useState<StreamVariant[]>([]);
  const [variantsLoading, setVariantsLoading] = useState<boolean>(false);
  const [variantsFailed, setVariantsFailed] = useState<boolean>(false);
  const [switching, setSwitching] = useState<boolean>(false);
  const [variantAttempt, setVariantAttempt] = useState<number>(0);
  const switchingRef = useRef<boolean>(false);

  const episodeId = session?.episodeId;
  const seeded = variantAttempt === 0 ? session?.variants : undefined;

  useEffect(() => {
    if (!episodeId) {
      setVariants([]);
      setVariantsFailed(false);
      return;
    }
    if (seeded && seeded.length > 0) {
      const preferred = preferNativeVariants(seeded);
      setVariants(preferred);
      setVariantsLoading(false);
      setVariantsFailed(false);
      ignore(prefetchNativeSources(episodeId, preferred));
      return;
    }
    let cancelled = false;
    setVariantsLoading(true);
    setVariantsFailed(false);
    const load = async () => {
      const [result, failure] = await attempt(loadPlayers(episodeId));
      if (cancelled) return;
      setVariantsLoading(false);
      if (failure || !result) {
        setVariantsFailed(true);
        return;
      }
      const preferred = preferNativeVariants(result);
      setVariants(preferred);
      ignore(prefetchNativeSources(episodeId, preferred, () => cancelled));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [episodeId, seeded, variantAttempt]);

  const reloadVariants = useCallback(() => {
    setVariantAttempt((attempt) => attempt + 1);
  }, []);

  const runSwitch = useCallback(async (build: () => Promise<StreamOpen>): Promise<boolean> => {
    if (switchingRef.current) return false;
    switchingRef.current = true;
    setSwitching(true);
    const [next, buildFailure] = await attempt(build());
    if (buildFailure !== null || !next) {
      switchingRef.current = false;
      setSwitching(false);
      reportBackgroundError("player.stream.switch", buildFailure ?? new Error("empty stream"));
      return false;
    }
    playbackAtoms.streamResume.set(next.resume ?? currentPosition());
    const [, openFailure] = await attempt(openStream(next));
    switchingRef.current = false;
    setSwitching(false);
    if (openFailure) {
      playbackAtoms.streamResume.set(null);
      reportBackgroundError("player.stream.switch", openFailure);
      return false;
    }
    streamSession.set(next);
    return true;
  }, []);

  const switchQuality = useCallback(
    async (label: string) => {
      const current = streamSession.get();
      if (!current || label === current.quality) return false;
      const url = variantSourceUrl(current.sources, label);
      if (!url) return false;
      const opened = await runSwitch(async () => ({
        ...current,
        quality: label,
        mediaUrl: url,
        resume: currentPosition(),
        paused: playbackAtoms.paused.get(),
      }));
      if (opened) await rememberPrefs(current, { quality: label });
      return opened;
    },
    [runSwitch]
  );

  const switchVariant = useCallback(
    async (variant: StreamVariant) => {
      const current = streamSession.get();
      if (!current) return false;
      const variantId = buildVariantId(variant);
      if (variantId === current.variantId) return false;
      const opened = await runSwitch(async () => {
        const sources = await loadSources(current.episodeId, variantId);
        const source = pickSource(sources, current.quality || fallbackQuality());
        if (!source) throw new Error("this voice-over has no playable sources");
        return {
          ...current,
          variantId: source.variantId || variantId,
          quality: source.label,
          mediaUrl: source.url,
          headers: source.headers,
          sources: toVariantSources(sources),
          resume: currentPosition(),
          paused: playbackAtoms.paused.get(),
        };
      });
      if (!opened) return false;
      const after = streamSession.get();
      if (after?.variantId !== variantId) return false;
      await rememberPrefs(current, { variantId, quality: after.quality });
      return true;
    },
    [runSwitch]
  );

  return {
    session,
    variants,
    variantsLoading,
    variantsFailed,
    switching,
    switchQuality,
    switchVariant,
    reloadVariants,
  };
}

export function useStreamNext(): PlayerStreamNext {
  const session = useCell(streamSession);
  const mediaId = session?.mediaId;
  const episodeNumber = session?.episodeNumber ?? null;
  const [episodes, setEpisodes] = useState<StreamingEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState<boolean>(false);

  useEffect(() => {
    setEpisodes([]);
    if (!mediaId) return;
    let cancelled = false;
    setEpisodesLoading(true);
    const load = async () => {
      const [loaded] = await attempt(loadEpisodes(mediaId));
      if (cancelled) return;
      setEpisodesLoading(false);
      setEpisodes(loaded ?? []);
    };
    ignore(load());
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const hasNext =
    episodeNumber !== null && episodes.some((episode) => episode.number > episodeNumber);

  const open = useCallback(async (resolve: (current: StreamOpen) => Promise<StreamOpen | null>) => {
    const current = streamSession.get();
    if (!current) return;
    const [next, failure] = await attempt(resolve(current));
    if (failure || !next) {
      addNotification(
        tr("stream.playFailed"),
        "error",
        failure?.message ?? tr("stream.noNextEpisode")
      );
      return;
    }
    const [, openFailure] = await attempt(openStream(next));
    if (openFailure) {
      addNotification(tr("stream.playFailed"), "error", openFailure.message);
      return;
    }
    streamSession.set(next);
    await rememberPrefs(current, {
      variantId: next.variantId,
      quality: next.quality,
    });
  }, []);

  const goNext = useCallback(async () => {
    await open((current) => resolveNextStream(current));
  }, [open]);

  const goTo = useCallback(
    async (episode: StreamingEpisode) => {
      if (episode.id === streamSession.get()?.episodeId) return;
      await open((current) => resolveEpisodeStream(current, episode));
    },
    [open]
  );

  return { hasNext, episodes, episodesLoading, goNext, goTo };
}
