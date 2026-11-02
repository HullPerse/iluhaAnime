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
import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";
import { lowerQualityLabel } from "@/lib/player/streamQuality.utils";
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

/** A continuous buffer stall worth reacting to, and how often it is checked. */
const AUTO_QUALITY_STALL_MS = 12_000;
const AUTO_QUALITY_CHECK_MS = 1_000;

/** The stream identity that keeps its "already downgraded" budget. */
function logicalStreamKey(session: StreamOpen): string {
  return `${session.mediaId}:${session.episodeId}:${session.variantId}`;
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
  const manualQualityRef = useRef<Set<string>>(new Set());
  const autoQualityRef = useRef<Set<string>>(new Set());
  const stalledSinceRef = useRef<number | null>(null);

  const episodeId = session?.episodeId;
  const seeded = session?.variants;

  useEffect(() => {
    if (!episodeId) {
      setVariants([]);
      setVariantsFailed(false);
      return;
    }
    const initialVariants = variantAttempt === 0 ? seeded : undefined;
    if (initialVariants && initialVariants.length > 0) {
      const preferred = preferNativeVariants(initialVariants);
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

  const applyQuality = useCallback(
    async (label: string, automatic: boolean) => {
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
      // Preferences are not part of the switch: the dropdown must settle as
      // soon as the session changed, not after two more IPC writes.
      if (opened) {
        if (!automatic) manualQualityRef.current.add(logicalStreamKey(current));
        ignore(rememberPrefs(current, { quality: label }));
      }
      return opened;
    },
    [runSwitch]
  );

  const switchQuality = useCallback(
    (label: string) => applyQuality(label, false),
    [applyQuality]
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
        const nextVariantId = source.variantId || variantId;
        return {
          ...current,
          variantId: nextVariantId,
          // The route depends on the target player, not on the one that is
          // playing: a Kodik voice-over plays from its CDN directly, an
          // AnimeLib one keeps the catalog proxy.
          proxyUrl: playbackProxyUrl(nextVariantId, settingsAtoms.animelibProxyUrl.get()),
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
      ignore(rememberPrefs(current, { variantId, quality: after.quality }));
      return true;
    },
    [runSwitch]
  );

  useEffect(() => {
    // A stall from the previous voice-over must not count toward the new one.
    stalledSinceRef.current = null;
  }, [episodeId, session?.variantId]);

  // One automatic step down per voice-over: a slow connection gets a playable
  // quality instead of an endless buffering screen, while a manual pick is
  // never overridden and the user is told about the change.
  useEffect(() => {
    const id = setInterval(() => {
      const current = streamSession.get();
      if (!current) {
        stalledSinceRef.current = null;
        return;
      }
      const stalled =
        playbackAtoms.pausedForCache.get() === true && playbackAtoms.paused.get() !== true;
      if (!stalled || switchingRef.current) {
        stalledSinceRef.current = null;
        return;
      }
      const key = logicalStreamKey(current);
      if (manualQualityRef.current.has(key) || autoQualityRef.current.has(key)) {
        stalledSinceRef.current = null;
        return;
      }
      stalledSinceRef.current ??= Date.now();
      if (Date.now() - stalledSinceRef.current < AUTO_QUALITY_STALL_MS) return;
      const lower = lowerQualityLabel(current.sources, current.quality);
      stalledSinceRef.current = null;
      autoQualityRef.current.add(key);
      if (!lower) return;
      ignore(
        applyQuality(lower, true).then((opened) => {
          if (opened) {
            addNotification(
              tr("player.stream.quality.auto.title"),
              "info",
              tr("player.stream.quality.auto.body", { quality: lower })
            );
          }
          return undefined;
        })
      );
    }, AUTO_QUALITY_CHECK_MS);
    return () => clearInterval(id);
  }, [applyQuality]);

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
