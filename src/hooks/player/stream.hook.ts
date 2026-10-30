// Stream session control for the player window.
//
// The window plays a stream when the open request carried one. Two switches
// live here: quality, which reuses the resolved source list and only reloads
// the media URL, and voice-over, which is a different stream on the source
// side and therefore resolves again. Both keep the position and the pause
// state, and both replace the session only after the new source resolved, so a
// failure leaves the working stream playing.
//
// Rows, sources and seasons come from the shared session cache, so two controls
// asking for the same episode make one request and a voice-over that was
// already resolved switches without touching the source again.

import { useCallback, useEffect, useRef, useState } from "react";

import { streamApi } from "@/api/stream.api";
import { tr } from "@/lib/locale/i18n.utils";
import { useCell } from "@/lib/state/signal.hook";
import { buildVariantId } from "@/lib/stream/helpers";
import { emptyPrefs, preferNativeVariants } from "@/lib/stream/prefs.utils";
import {
  loadEpisodes,
  loadPlayers,
  loadSources,
  prefetchNativeSources,
} from "@/lib/stream/sessionCache.utils";
import { pickSource, toVariantSources, variantSourceUrl } from "@/lib/stream/sources.utils";
import { openStream } from "@/lib/player/playback.utils";
import { resolveEpisodeStream, resolveNextStream } from "@/lib/player/stream.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { addNotification } from "@/store/notification.store";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { StreamPrefs, StreamVariant, StreamingEpisode } from "@/types/stream";
import type { StreamOpen } from "@/types/videoPlayer";

export interface PlayerStream {
  session: StreamOpen | null;
  /** The other voice-overs of the current episode, loaded on first open. */
  variants: StreamVariant[];
  variantsLoading: boolean;
  variantsFailed: boolean;
  switching: boolean;
  /** False when another switch is running or the choice could not be opened. */
  switchQuality: (label: string) => Promise<boolean>;
  switchVariant: (variant: StreamVariant) => Promise<boolean>;
  reloadVariants: () => void;
}

export interface PlayerStreamNext {
  hasNext: boolean;
  /** The season of the session's title, for the episode list. */
  episodes: StreamingEpisode[];
  episodesLoading: boolean;
  goNext: () => Promise<void>;
  goTo: (episode: StreamingEpisode) => Promise<void>;
}

function currentPosition(): number {
  return playbackAtoms.timePos.get();
}

/** The configured start quality, used only when the session carries none. */
function fallbackQuality(): string {
  return settingsAtoms.streamDefaultQuality.get();
}

/**
 * Merge a choice into the title's remembered preferences. A failed write must
 * never fail playback: it only means the next episode falls back.
 */
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
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsFailed, setVariantsFailed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [variantAttempt, setVariantAttempt] = useState(0);
  // One switch at a time: a second click while the first resolve runs would
  // otherwise race two media loads into the same session.
  const switchingRef = useRef(false);

  const episodeId = session?.episodeId;
  // The catalog window already fetched this episode's rows before it opened
  // the player. Seeding the list from the request saves that second request
  // (about 0.7 s live) and makes the voice-over menu usable on first paint.
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
      // The site's own rows resolve from the episode detail already in memory,
      // so warming them turns a later switch into a media reload.
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

  /**
   * Resolve the replacement first, then load it. The timeline keeps following
   * the playing stream while the source resolves and is pinned only when the
   * media is about to be replaced, so it never flashes the new stream's first
   * zero sample.
   */
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

/**
 * Episode navigation for a stream session: the season, whether a next episode
 * exists, and how to open one. Separate from `usePlayerStream` so the player
 * window loads the season once, not once per control that renders the source
 * panel. `loadEpisodes` is cached per title, so the panel and the bar share one
 * request.
 */
export function useStreamNext(): PlayerStreamNext {
  const session = useCell(streamSession);
  const mediaId = session?.mediaId;
  const episodeNumber = session?.episodeNumber ?? null;
  const [episodes, setEpisodes] = useState<StreamingEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

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
