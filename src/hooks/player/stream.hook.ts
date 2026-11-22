import { useCallback, useEffect, useRef, useState } from "react";

import { useStreamOperation } from "@/hooks/player/streamOperation.hook";
import { createInterval } from "@hullperse/hp_utils/interval";
import { tr } from "@/lib/locale/i18n.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { buildVariantId } from "@/lib/player/streamHelpers.utils";
import { preferNativeVariants } from "@/lib/player/streamPrefs.utils";
import { rememberStreamPrefs as rememberPrefs } from "@/lib/player/streamPreferences.utils";
import {
  loadEpisodes,
  loadPlayers,
  loadSources,
} from "@/lib/core/player/sessionCache.utils";
import { pickSource, toVariantSources, variantSourceUrl } from "@/lib/search/sources.utils";
import { playbackProxyUrl } from "@/lib/player/streamProxy.utils";
import { lowerQualityLabel } from "@/lib/player/streamQuality.utils";
import { resolveEpisodeStream, resolveNextStream } from "@/lib/player/playerStream.utils";
import { attempt } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/shared/promise.utils";
import { addNotification } from "@/store/notification.store";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { getStreamProxyUrl, settingsAtoms } from "@/store/settings.store";
import { DEFAULT_STREAM_SOURCE } from "@/config/player/streamSources.config";
import type { StreamSourceId, StreamVariant, StreamingEpisode } from "@/types/player/stream";
import type { StreamOpen } from "@/types/player/videoPlayer";
import type { PlayerStream, PlayerStreamNext } from "@/types/player/playerStream";

function currentPosition(): number {
  const current = streamSession.get();

  if (current && playbackAtoms.path.get() !== current.mediaUrl) return current.resume ?? 0;

  return playbackAtoms.timePos.get();
}

function fallbackQuality(): string {
  return settingsAtoms.streamDefaultQuality.get();
}

const AUTO_QUALITY_STALL_MS = 12_000;
const AUTO_QUALITY_CHECK_MS = 1_000;

function logicalStreamKey(session: StreamOpen): string {
  return `${session.sourceId}:${session.mediaId}:${session.episodeId}:${session.variantId}`;
}

export function usePlayerStream(): PlayerStream {
  const runOperation = useStreamOperation();
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
  const sourceId = (session?.sourceId ?? DEFAULT_STREAM_SOURCE) as StreamSourceId;
  const seeded = session?.variants;
  const stallKey = `${episodeId ?? ""}:${session?.variantId ?? ""}`;
  const lastStallKeyRef = useRef<string>(stallKey);

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

      return;
    }

    let cancelled = false;
    setVariantsLoading(true);
    setVariantsFailed(false);
    const load = async () => {
      const [result, failure] = await attempt(loadPlayers(episodeId, sourceId));

      if (cancelled) return;
      setVariantsLoading(false);

      if (failure || !result) {
        setVariantsFailed(true);

        return;
      }

      const preferred = preferNativeVariants(result);
      setVariants(preferred);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [episodeId, seeded, sourceId, variantAttempt]);

  useEffect(() => {
    if (!episodeId || !session?.mediaId) return;
    manualQualityRef.current.clear();
    autoQualityRef.current.clear();
  }, [session?.mediaId, episodeId]);

  const reloadVariants = useCallback(() => {
    setVariantAttempt((attempt) => attempt + 1);
  }, []);

  const runSwitch = useCallback(
    async (build: () => Promise<StreamOpen>): Promise<boolean> => {
      if (switchingRef.current) return false;
      switchingRef.current = true;
      setSwitching(true);
      const opened = await runOperation(build);
      switchingRef.current = false;
      setSwitching(false);

      return opened;
    },
    [runOperation]
  );

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

      if (opened) {
        if (!automatic) manualQualityRef.current.add(logicalStreamKey(current));
        ignore(rememberPrefs(current, { quality: label }));
      }

      return opened;
    },
    [runSwitch]
  );

  const switchQuality = useCallback((label: string) => applyQuality(label, false), [applyQuality]);

  const switchVariant = useCallback(
    async (variant: StreamVariant) => {
      const current = streamSession.get();

      if (!current) return false;
      const variantId = buildVariantId(variant);

      if (variantId === current.variantId) return false;
      const opened = await runSwitch(async () => {
        const sources = await loadSources(
          current.episodeId,
          variantId,
          current.sourceId as StreamSourceId
        );
        const source = pickSource(sources, current.quality || fallbackQuality());

        if (!source) throw new Error("this voice-over has no playable sources");
        const nextVariantId = source.variantId || variantId;

        return {
          ...current,
          variantId: nextVariantId,
          proxyUrl: playbackProxyUrl(
            nextVariantId,
            getStreamProxyUrl(current.sourceId as StreamSourceId)
          ),
          quality: source.label,
          mediaUrl: source.url,
          headers: source.headers,
          sources: toVariantSources(sources),
          subtitles: source.subtitles,
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
    if (lastStallKeyRef.current === stallKey) return;
    lastStallKeyRef.current = stallKey;
    stalledSinceRef.current = null;
  }, [stallKey]);

  useEffect(() => {
    const { cancel } = createInterval(() => {
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

    return cancel;
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
  const runOperation = useStreamOperation();
  const session = useCell(streamSession);
  const mediaId = session?.mediaId;
  const sourceId = (session?.sourceId ?? DEFAULT_STREAM_SOURCE) as StreamSourceId;
  const episodeNumber = session?.episodeNumber ?? null;
  const [episodes, setEpisodes] = useState<StreamingEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState<boolean>(false);

  useEffect(() => {
    setEpisodes([]);

    if (!mediaId) {
      setEpisodesLoading(false);

      return;
    }

    let cancelled = false;
    setEpisodesLoading(true);
    const load = async () => {
      const [loaded] = await attempt(loadEpisodes(mediaId, sourceId));

      if (cancelled) return;
      setEpisodesLoading(false);
      setEpisodes(loaded ?? []);
    };

    ignore(load());

    return () => {
      cancelled = true;
    };
  }, [mediaId, sourceId]);

  const hasNext =
    episodeNumber !== null && episodes.some((episode) => episode.number > episodeNumber);

  const open = useCallback(
    async (resolve: (current: StreamOpen) => Promise<StreamOpen | null>) => {
      const opened = await runOperation(resolve);
      const next = streamSession.get();

      if (opened && next)
        await rememberPrefs(next, { variantId: next.variantId, quality: next.quality });
    },
    [runOperation]
  );

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
