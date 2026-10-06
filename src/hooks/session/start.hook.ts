import { SESSION_COMMAND_EVENT, SESSION_START_EVENT } from "@/config/lobby/common.config";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { openPlayer } from "@/lib/player/playback.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { usePlaybackStore } from "@/store/player.store";
import { useSessionStore } from "@/store/session.store";
import type { SessionCommand, SessionRole, SessionStartItem } from "@/types/session";

// Only identity may publish, never path.
function openItem(itemId: string, path: string): void {
  useSessionStore.getState().setPlayingItemId(itemId);
  const state = usePlaybackStore.getState();
  if (state.hasFile && state.path === path) return;
  ignore(openPlayer([path], 0, { roomDriven: true }));
}

// P5; host paths never cross wire.
export function useSessionStartBridge(role: SessionRole | null): void {
  useTauriEvent<SessionStartItem>(
    SESSION_START_EVENT,
    (event) => {
      if (event.payload.path) openItem(event.payload.itemId, event.payload.path);
    },
    { enabled: role === "host", errorTag: "session-start" }
  );

  useTauriEvent<SessionCommand>(
    SESSION_COMMAND_EVENT,
    (event) => {
      const { action } = event.payload;
      if (action.a !== "load") return;
      const path = useSessionStore.getState().planPaths[action.mediaId];
      if (path) openItem(action.mediaId, path);
    },
    { enabled: role === "guest", errorTag: "session-start" }
  );
}
