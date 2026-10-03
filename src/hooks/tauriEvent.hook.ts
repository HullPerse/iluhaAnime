import { useEffect, useRef } from "react";
import { listen, type Event, type EventName } from "@tauri-apps/api/event";
import { reportBackgroundError } from "../lib/utils/attempt.utils";

/**
 * Subscribe to a Tauri event and clean up on unmount or `enabled` toggles.
 *
 * The listener is (re)subscribed whenever `event`, `enabled`, or `errorTag`
 * changes. The live handler is kept in a ref that updates on every render,
 * so the listener always dispatches to the latest handler. There is no
 * `deps` option: re-subscribing on state changes would be redundant with
 * the ref and would add a brief event-loss window between the old
 * unlisten and the new listen resolving.
 *
 * Errors from `listen` are reported through `reportBackgroundError`
 * with the tag `${errorTag ?? event}.listen` — mirroring the classic
 * `.catch((error) => reportBackgroundError(...))` handling this hook
 * replaces.
 */
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
