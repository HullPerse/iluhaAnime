import { useCallback, useEffect, useRef } from "react";

import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { ignore } from "@/lib/core/promise.utils";
import { openStream } from "@/lib/player/playback.utils";
import {
  alternateProxyUrl,
  streamRetryPosition,
  streamRouteKey,
} from "@/lib/player/streamRoute.utils";
import { rememberStreamRoute } from "@/lib/player/streamRouteMemory.utils";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { StreamOpen } from "@/types/player/videoPlayer";

/** How often the guard looks at a load that has not produced a frame yet. */
const CHECK_MS = 500;
/** A load with no first frame and no download gets this long before a retry. */
const STALL_MS = 12_000;
/** Even a downloading load is retried after this long without a first frame. */
const STALL_LIMIT_MS = 25_000;
/** Below this mpv is not really receiving data, whatever the elapsed time. */
const SLOW_BYTES_PER_SECOND = 32 * 1024;
/** Two retries: the other route first, then the original route once more. */
const MAX_RETRIES = 2;
const RETRY_COOLDOWN_MS = 1_000;

interface GuardState {
  key: string;
  attempts: number;
  startedAt: number;
  playing: boolean;
  gaveUp: boolean;
  baseProxy: string | null;
  retriedAt: number;
}

export interface StreamRouteGuard {
  /** Playback started: this load is healthy, stop the stall timer. */
  markPlaying: () => void;
  /** mpv reported an error for the current stream. */
  failNow: () => void;
  /** The user asked to try the failed stream again. */
  retryNow: () => void;
}

function freshState(key: string, baseProxy: string | null): GuardState {
  return {
    key,
    attempts: 0,
    startedAt: Date.now(),
    playing: false,
    gaveUp: false,
    baseProxy,
    retriedAt: 0,
  };
}

/**
 * Keeps a stream open alive on a bad network.
 *
 * A voice-over or a CDN can be unreachable on one route and fine on the other,
 * so a load that never produces a frame (or that mpv reports as an error) is
 * reopened once on the other route and once more on the original one, at the
 * last known position. Only after that the player shows its error screen.
 */
export function useStreamRouteGuard({
  session,
  setLoadingFile,
  setFailed,
}: {
  session: StreamOpen | null;
  setLoadingFile: (loading: boolean) => void;
  setFailed: (failed: boolean) => void;
}): StreamRouteGuard {
  const stateRef = useRef<GuardState>({
    key: "",
    attempts: 0,
    startedAt: 0,
    playing: false,
    gaveUp: false,
    baseProxy: null,
    retriedAt: 0,
  });
  const sessionRef = useRef<StreamOpen | null>(session);
  const ioRef = useRef({ setLoadingFile, setFailed });

  useEffect(() => {
    ioRef.current = { setLoadingFile, setFailed };
  }, [setFailed, setLoadingFile]);

  useEffect(() => {
    const key = session ? streamRouteKey(session) : "";
    sessionRef.current = session;
    const current = stateRef.current;
    if (current.key === key) return;
    stateRef.current = freshState(key, session?.proxyUrl ?? null);
  }, [session]);

  const giveUp = useCallback(() => {
    const state = stateRef.current;
    if (state.gaveUp) return;
    state.gaveUp = true;
    state.playing = false;
    ioRef.current.setLoadingFile(false);
    ioRef.current.setFailed(true);
  }, []);

  const retry = useCallback(() => {
    const state = stateRef.current;
    const current = sessionRef.current;
    if (!current || state.gaveUp) return;
    const now = Date.now();
    if (now - state.retriedAt < RETRY_COOLDOWN_MS) return;
    if (state.attempts >= MAX_RETRIES) {
      giveUp();
      return;
    }

    let nextProxy: string | null | undefined;
    if (state.attempts === 0) {
      nextProxy = alternateProxyUrl(state.baseProxy, settingsAtoms.animelibProxyUrl.get());
    }
    // The original route is retried once by itself, because a CDN hiccup often
    // clears in a couple of seconds while the other route can be much slower.
    if (nextProxy === undefined) nextProxy = state.baseProxy;

    const resume = streamRetryPosition(current, playbackAtoms.timePos.get());
    const next: StreamOpen = {
      ...current,
      proxyUrl: nextProxy,
      resume,
      paused: playbackAtoms.paused.get(),
    };
    state.attempts += 1;
    state.retriedAt = now;
    state.startedAt = now;
    state.playing = false;
    if (resume !== undefined) playbackAtoms.streamResume.set(resume);
    ioRef.current.setFailed(false);
    ioRef.current.setLoadingFile(true);
    ignore(
      openStream(next)
        .then(() => {
          sessionRef.current = next;
          streamSession.set(next);
          return undefined;
        })
        .catch((error: unknown) => reportBackgroundError("player.stream.route", error))
    );
  }, [giveUp]);

  useEffect(() => {
    const id = setInterval(() => {
      const state = stateRef.current;
      if (sessionRef.current === null || state.playing || state.gaveUp) return;
      const elapsed = Date.now() - state.startedAt;
      if (elapsed < STALL_MS) return;
      const speed = playbackAtoms.cacheSpeed.get() ?? 0;
      const stalled = elapsed >= STALL_LIMIT_MS || speed < SLOW_BYTES_PER_SECOND;
      if (!stalled) return;
      retry();
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [retry]);

  const markPlaying = useCallback(() => {
    const state = stateRef.current;
    const current = sessionRef.current;
    if (!current) return;
    // A seek in the previous file also emits playback-restart, so only the file
    // that belongs to this session counts.
    if (playbackAtoms.path.get() !== current.mediaUrl) return;
    state.playing = true;
    state.gaveUp = false;
    // The route that produced a frame is the one to start with next time.
    rememberStreamRoute(current.variantId, current.mediaUrl, current.proxyUrl);
  }, []);

  const failNow = useCallback(() => {
    const current = sessionRef.current;
    if (!current) {
      ioRef.current.setLoadingFile(false);
      ioRef.current.setFailed(true);
      return;
    }
    retry();
  }, [retry]);

  const retryNow = useCallback(() => {
    const state = stateRef.current;
    state.attempts = 0;
    state.gaveUp = false;
    state.retriedAt = 0;
    state.startedAt = Date.now();
    state.playing = false;
    retry();
  }, [retry]);

  return { markPlaying, failNow, retryNow };
}
