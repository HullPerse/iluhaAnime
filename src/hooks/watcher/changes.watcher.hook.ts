import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { WATCHER_EVENTS } from "@/lib/watcher/events.watcher";
import type { FolderContentChanged } from "@/types/watcher";

/**
 * Typed subscription to the library folder watcher. Consumers no longer have
 * to know the event name or the payload shape.
 */
export function useFolderContentChanged(
  handler: (payload: FolderContentChanged) => void,
  options?: { enabled?: boolean; errorTag?: string }
): void {
  useTauriEvent<FolderContentChanged>(
    WATCHER_EVENTS.folderContentChanged,
    (event) => handler(event.payload),
    options
  );
}
