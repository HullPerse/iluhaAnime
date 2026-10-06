import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { sessionApi } from "@/api/session.api";
import {
  SESSION_COMMAND_EVENT,
  SESSION_PLAYBACK_EVENT,
  SESSION_PUBLISH_INTERVAL_MS,
  SESSION_SYNC_INTERVAL_MS,
  SESSION_TRACK_EVENT,
} from "@/config/lobby/common.config";
import { SESSION_STATUS_QUERY_KEY, useSessionStatus } from "@/hooks/session/queries.hook";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import {
  seekTo,
  selectTrack,
  setMpvProperty,
  setPaused,
  setSpeed,
} from "@/lib/player/playback.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { usePlaybackStore } from "@/store/player.store";
import { useSessionStore } from "@/store/session.store";
import type {
  ControlAction,
  PlaybackState,
  SessionCommand,
  SessionRole,
  SessionStatus,
  SyncSample,
  TrackState,
} from "@/types/session";

export interface SessionPlayerApi {
  role: SessionRole | null;
  status: SessionStatus | undefined;
  sample: SyncSample | null;
  hostLost: boolean;
  onLocalControl: (action: ControlAction) => void;
  onLocalTrack: (track: TrackState) => void;
  publish: () => void;
  resync: () => void;
  resumeAlone: () => void;
  setOffsetMs: (offsetMs: number) => void;
}

export function useSessionPlayer(): SessionPlayerApi {
  const statusQuery = useSessionStatus();
  const status = statusQuery.data;
  const role = status?.role ?? null;
  const queryClient = useQueryClient();

  const [sample, setSample] = useState<SyncSample | null>(null);

  const roleRef = useRef<SessionRole | null>(null);
  const lastCommandRevisionRef = useRef(0);
  const lastRateRef = useRef(1);
  const samplingRef = useRef(false);
  const publishingRef = useRef(false);
  const hostLostRef = useRef(false);
  const resumeOnReturnRef = useRef(false);

  const hostLost = role === "guest" && status !== undefined && !status.hostOnline;

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const publish = useCallback(() => {
    if (roleRef.current !== "host" || publishingRef.current) return;
    const state = usePlaybackStore.getState();
    if (!state.hasFile) return;
    // Local path must not travel.
    const mediaId = useSessionStore.getState().playingItemId;
    if (!mediaId) return;
    publishingRef.current = true;
    sessionApi
      .publishState({
        isPlaying: !state.paused,
        mediaId,
        position: state.timePos,
        rate: state.speed,
      })
      .catch(() => undefined)
      .finally(() => {
        publishingRef.current = false;
      });
  }, []);

  const onLocalControl = useCallback(
    (action: ControlAction) => {
      ignore(sessionApi.control(action));
      if (roleRef.current === "host") publish();
    },
    [publish]
  );

  const onLocalTrack = useCallback((track: TrackState) => {
    ignore(sessionApi.syncTracks(track));
  }, []);

  const resync = useCallback(() => {
    ignore(sessionApi.forceResync());
  }, []);

  const resumeAlone = useCallback(() => {
    resumeOnReturnRef.current = false;
    hostLostRef.current = false;
    useSessionStore.getState().setPlayingItemId(null);
    ignore(setPaused(false));
    ignore(
      sessionApi.leave().finally(() => {
        ignore(queryClient.invalidateQueries({ queryKey: SESSION_STATUS_QUERY_KEY }));
      })
    );
  }, [queryClient]);

  const applyInstruction = useCallback((next: SyncSample) => {
    const instruction = next.instruction;
    if (!instruction || usePlaybackStore.getState().paused) return;
    if (instruction.kind === "seek") {
      usePlaybackStore.getState().setSeekTarget(instruction.position);
      ignore(seekTo(instruction.position, "exact"));
      ignore(sessionApi.syncRestart());
      return;
    }
    if (Math.abs(instruction.rate - lastRateRef.current) < 0.001) return;
    lastRateRef.current = instruction.rate;
    ignore(setSpeed(instruction.rate));
  }, []);

  const applyCommand = useCallback((action: ControlAction) => {
    switch (action.a) {
      case "play": {
        ignore(setPaused(false));
        break;
      }
      case "pause": {
        ignore(setPaused(true));
        break;
      }
      case "seek": {
        usePlaybackStore.getState().setSeekTarget(action.position);
        ignore(seekTo(action.position, "exact"));
        break;
      }
      case "setRate": {
        ignore(setSpeed(action.rate));
        break;
      }
      case "load": {
        break;
      }
    }
  }, []);

  const applyTrack = useCallback((track: TrackState) => {
    const audio = parseTrackId(track.audio);
    if (audio !== undefined) ignore(selectTrack("audio", audio));
    const sub = parseSubTrack(track.sub);
    if (sub !== undefined) ignore(selectTrack("sub", sub));
    ignore(setMpvProperty("audio-delay", track.audioDelay));
    ignore(setMpvProperty("sub-delay", track.subDelay));
  }, []);

  const sampleOnce = useCallback(() => {
    const state = usePlaybackStore.getState();
    if (!state.hasFile || samplingRef.current) return;
    samplingRef.current = true;
    sessionApi
      .syncSample(state.timePos, useSessionStore.getState().playingItemId)
      .then((next) => {
        setSample(next);
        applyInstruction(next);
      })
      .catch(() => undefined)
      .finally(() => {
        samplingRef.current = false;
      });
  }, [applyInstruction]);

  const setOffsetMs = useCallback((offsetMs: number) => {
    ignore(
      sessionApi.setOffset(offsetMs).then((stored) => {
        setSample((previous) =>
          previous ? { ...previous, offsetMs: stored } : previous
        );
      })
    );
  }, []);

  useTauriEvent<SessionCommand>(
    SESSION_COMMAND_EVENT,
    (event) => {
      if (roleRef.current === null) return;
      const { action, revision } = event.payload;
      if (revision <= lastCommandRevisionRef.current) return;
      lastCommandRevisionRef.current = revision;
      applyCommand(action);
    },
    { enabled: role !== null, errorTag: "session-command" }
  );

  useTauriEvent<PlaybackState>(
    SESSION_PLAYBACK_EVENT,
    () => {
      // Evaluate now so joins settle sooner.
      if (roleRef.current !== "guest") return;
      sampleOnce();
    },
    { enabled: role === "guest", errorTag: "session-playback" }
  );

  useTauriEvent<TrackState>(
    SESSION_TRACK_EVENT,
    (event) => {
      if (roleRef.current !== "guest") return;
      applyTrack(event.payload);
    },
    { enabled: role === "guest", errorTag: "session-track" }
  );

  useEffect(() => {
    if (role !== "host") return;
    const id = window.setInterval(() => {
      const state = usePlaybackStore.getState();
      if (state.paused || !state.hasFile) return;
      publish();
    }, SESSION_PUBLISH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [publish, role]);

  useEffect(() => {
    if (role !== "guest") {
      setSample(null);
      return;
    }
    const id = window.setInterval(sampleOnce, SESSION_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [role, sampleOnce]);

  useEffect(() => {
    if (role !== "guest") {
      hostLostRef.current = false;
      resumeOnReturnRef.current = false;
      return;
    }
    if (hostLost && !hostLostRef.current) {
      hostLostRef.current = true;
      const state = usePlaybackStore.getState();
      if (state.hasFile && !state.paused) {
        resumeOnReturnRef.current = true;
        ignore(setPaused(true));
      }
    } else if (!hostLost && hostLostRef.current) {
      hostLostRef.current = false;
      if (resumeOnReturnRef.current) {
        resumeOnReturnRef.current = false;
        ignore(setPaused(false));
        sampleOnce();
      }
    }
  }, [hostLost, role, sampleOnce]);

  return {
    hostLost,
    onLocalControl,
    onLocalTrack,
    publish,
    resync,
    resumeAlone,
    role,
    sample,
    setOffsetMs,
    status,
  };
}

function parseTrackId(value: string | null): number | undefined {
  if (value === null) return undefined;
  const id = Number(value);
  return Number.isFinite(id) && id >= 0 ? id : undefined;
}

function parseSubTrack(value: string | null): number | "no" | undefined {
  if (value === null) return undefined;
  if (value === "no") return "no";
  return parseTrackId(value);
}
