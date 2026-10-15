import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { WATCHER_EVENTS } from "@/lib/watcher/events.watcher";
import type { FolderContentChanged } from "@/types/watcher";

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
