import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { WATCHER_EVENTS } from "@/lib/core/eventsWatcher.utils";
import type { FolderContentChanged } from "@/types/core/watcher";

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
