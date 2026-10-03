import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { usePlaybackStore } from "@/store/player.store";
import type {
  DroppedFramesData,
  MpvChapter,
  MpvTrack,
  PlaybackEvent,
  PlaybackSnapshot,
  PlayerOpenRequest,
} from "@/types/videoPlayer";

export interface PlayerEventHandlers {
  onOpenRequest?: (request: PlayerOpenRequest) => void;
  onFileLoaded?: () => void;
  onEndFile?: (reason: string) => void;
  onPlaybackRestart?: () => void;
  onIdle?: () => void;
  onShutdown?: () => void;
  onError?: () => void;
  onDroppedFrames?: (data: DroppedFramesData) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseDroppedFrames(data: unknown): DroppedFramesData | undefined {
  if (!isRecord(data)) return undefined;
  const drops = toFiniteNumber(data.drops);
  const expectedFrames = toFiniteNumber(data.expectedFrames);
  const ratio = toFiniteNumber(data.ratio);
  const fps = toFiniteNumber(data.fps);
  if (
    drops === undefined ||
    expectedFrames === undefined ||
    ratio === undefined ||
    fps === undefined
  ) {
    return undefined;
  }
  return { drops, expectedFrames, ratio, fps };
}

export function usePlayerEvents(handlers: PlayerEventHandlers): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const { setSnapshot, setTracks, setChapters } =
      usePlaybackStore.getState();

    const subscriptions: Promise<UnlistenFn>[] = [
      listen<PlaybackSnapshot>("player-state", (event) => {
        if (event.payload) setSnapshot(event.payload);
      }),
      listen<MpvTrack[]>("player-tracks", (event) => {
        setTracks(event.payload ?? []);
      }),
      listen<MpvChapter[]>("player-chapters", (event) => {
        setChapters(event.payload ?? []);
      }),
      listen<PlayerOpenRequest>("player-open-request", (event) => {
        if (event.payload) handlersRef.current.onOpenRequest?.(event.payload);
      }),
      listen<PlaybackEvent>("player-event", (event) => {
        const payload = event.payload;
        if (!payload) return;
        switch (payload.kind) {
          case "file-loaded": {
            handlersRef.current.onFileLoaded?.();
            break;
          }
          case "end-file": {
            handlersRef.current.onEndFile?.(payload.reason ?? "");
            break;
          }
          case "idle": {
            handlersRef.current.onIdle?.();
            break;
          }
          case "playback-restart": {
            handlersRef.current.onPlaybackRestart?.();
            break;
          }
          case "shutdown": {
            handlersRef.current.onShutdown?.();
            break;
          }
          case "error": {
            handlersRef.current.onError?.();
            break;
          }
          case "dropped-frames": {
            const data = parseDroppedFrames(payload.data);
            if (data) handlersRef.current.onDroppedFrames?.(data);
            break;
          }
          default: {
            break;
          }
        }
      }),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription
          .then((unlisten) => unlisten())
          .catch((error) => reportBackgroundError("player-events.listen", error));
      }
    };
  }, []);
}
