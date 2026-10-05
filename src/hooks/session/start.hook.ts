import { SESSION_COMMAND_EVENT, SESSION_START_EVENT } from "@/config/lobby/common.config";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { openPlayer } from "@/lib/player/playback.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { usePlaybackStore } from "@/store/player.store";
import { useSessionStore } from "@/store/session.store";
import type { SessionCommand, SessionRole, SessionStartItem } from "@/types/session";

/**
 * Open the local player for a plan item the room just started, unless it is
 * already showing that file (the host and guests both receive events while the
 * lobby is mounted, and a moderator may start from either window).
 *
 * Records the item id the player now shows: it is the only identity the
 * frontend may publish to the room (never the local path).
 */
function openItem(itemId: string, path: string): void {
  useSessionStore.getState().setPlayingItemId(itemId);
  const state = usePlaybackStore.getState();
  if (state.hasFile && state.path === path) return;
  ignore(openPlayer([path], 0, { roomDriven: true }));
}

/**
 * Bridge the lobby to the player window for plan starts (P5).
 *
 * The host opens its own file when the backend emits `session-start-item`; a
 * guest (or moderator) resolves the item against its locally matched copies and
 * opens the `load` command the host routed to it. Host paths never cross the
 * wire, so the guest map lives client-side.
 */
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
