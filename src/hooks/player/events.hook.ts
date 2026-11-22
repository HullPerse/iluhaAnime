import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type { ZodMiniType } from "zod/mini";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import { attemptSync } from "@hullperse/hp_utils/attempt";
import {
  OpenRequestSchema,
  PlaybackSnapshotSchema,
  PlaybackTracksSchema,
  PlaybackChaptersSchema,
  PlaybackEventSchema,
} from "@/schemas/player.schema";

import { reportBackgroundError } from "@hullperse/hp_utils/attempt";
import { setPlaybackChapters, setPlaybackSnapshot, setPlaybackTracks } from "@/store/player.store";
import type { DroppedFramesData } from "@/types/player/videoPlayer";
import type { PlayerEventHandlers } from "@/types/core/events";

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
  const handlersRef = useRef<PlayerEventHandlers>(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    let disposed = false;
    const subscribe = <T>(
      name: string,
      schema: ZodMiniType<T>,
      receive: (value: T) => void
    ): Promise<UnlistenFn> =>
      listen<unknown>(name, (event) => {
        if (disposed) return;
        const [value, failure] = attemptSync(() => assertSchema(event.payload, schema));

        if (failure) {
          reportBackgroundError(`player-events.${name}`, failure);

          return;
        }

        receive(value);
      }).catch((error: unknown) => {
        reportBackgroundError(`player-events.${name}`, error);

        return () => {};
      });
    const subscriptions: Promise<UnlistenFn>[] = [
      subscribe("player-state", PlaybackSnapshotSchema, setPlaybackSnapshot),
      subscribe("player-tracks", PlaybackTracksSchema, setPlaybackTracks),
      subscribe("player-chapters", PlaybackChaptersSchema, setPlaybackChapters),
      subscribe("player-open-request", OpenRequestSchema, (request) =>
        handlersRef.current.onOpenRequest?.(request)
      ),
      subscribe("player-event", PlaybackEventSchema, (payload) => {
        switch (payload.kind) {
          case "file-loaded": {
            handlersRef.current.onFileLoaded?.();
            break;
          }

          case "end-file": {
            handlersRef.current.onEndFile?.(payload.reason ?? "", payload.path);
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
      disposed = true;

      for (const subscription of subscriptions) {
        subscription
          .then((unlisten) => unlisten())
          .catch((error) => reportBackgroundError("player-events.listen", error));
      }
    };
  }, []);
}
