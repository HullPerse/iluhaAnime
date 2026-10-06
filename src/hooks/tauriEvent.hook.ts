import { useEffect, useRef } from "react";
import { listen, type Event, type EventName } from "@tauri-apps/api/event";
import { reportBackgroundError } from "../lib/utils/attempt.utils";

// Ref always dispatches latest; resubscribing would lose events.
export function useTauriEvent<T>(
  event: EventName,
  handler: (event: Event<T>) => void,
  options?: {
    enabled?: boolean;
    errorTag?: string;
  },
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  const { enabled = true, errorTag } = options ?? {};

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    listen<T>(event, (received) => {
      handlerRef.current(received);
    })
      .then((unlistenFn) => {
        if (disposed) {
          unlistenFn();
          return;
        }
        unlisten = unlistenFn;
      })
      .catch((error) => {
        reportBackgroundError(`${errorTag ?? event}.listen`, error);
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [event, enabled, errorTag]);
}
