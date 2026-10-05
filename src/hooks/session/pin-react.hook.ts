import { useQueryClient } from "@tanstack/react-query";

import { SESSION_PIN_EVENT, SESSION_REACT_EVENT } from "@/config/lobby/common.config";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import type {
  PinnedMessage,
  ReactionEntry,
  SessionPin,
  SessionReaction,
  SessionStatus,
} from "@/types/session";

import { SESSION_STATUS_QUERY_KEY } from "./queries.hook";

/**
 * Apply one `session-react` frame to a flat list of reaction entries: the
 * peer joins the matching entry (or one is created), leaves it, and the
 * entry drops out once its last peer is gone.
 */
export function applyReactionToList(
  reactions: ReactionEntry[],
  frame: SessionReaction
): ReactionEntry[] {
  const index = reactions.findIndex(
    (entry) => entry.messageId === frame.messageId && entry.emoji === frame.emoji
  );
  if (frame.add) {
    if (index === -1) {
      return [
        ...reactions,
        { messageId: frame.messageId, emoji: frame.emoji, peers: [frame.peerId] },
      ];
    }
    const entry = reactions[index];
    if (entry.peers.includes(frame.peerId)) {
      return reactions;
    }
    const next = [...reactions];
    next[index] = { ...entry, peers: [...entry.peers, frame.peerId] };
    return next;
  }
  if (index === -1) {
    return reactions;
  }
  const entry = reactions[index];
  if (!entry.peers.includes(frame.peerId)) {
    return reactions;
  }
  const peers = entry.peers.filter((peerId) => peerId !== frame.peerId);
  if (peers.length === 0) {
    return reactions.filter((_, i) => i !== index);
  }
  const next = [...reactions];
  next[index] = { ...entry, peers };
  return next;
}

/**
 * Keeps the room's pin and reaction state current in the status query cache
 * between the one-second polls.
 *
 * The polled `session_status` snapshot is the source of truth (it replays the
 * pin and reactions on every poll); the instant events only shorten the wait.
 * A frame that arrives before the cache holds a status is skipped: the next
 * poll carries the same state.
 */
export function useChatPinReactions(): void {
  const queryClient = useQueryClient();

  useTauriEvent<SessionPin>(
    SESSION_PIN_EVENT,
    (event) => {
      const { messageId, pinnedBy } = event.payload;
      queryClient.setQueryData<SessionStatus>(SESSION_STATUS_QUERY_KEY, (status) => {
        if (status === undefined) {
          return status;
        }
        const pinned: PinnedMessage | null = messageId !== null ? { messageId, pinnedBy } : null;
        return { ...status, pinned };
      });
    },
    { errorTag: "session-pin" }
  );

  useTauriEvent<SessionReaction>(
    SESSION_REACT_EVENT,
    (event) => {
      const frame = event.payload;
      queryClient.setQueryData<SessionStatus>(SESSION_STATUS_QUERY_KEY, (status) => {
        if (status === undefined) {
          return status;
        }
        return { ...status, reactions: applyReactionToList(status.reactions, frame) };
      });
    },
    { errorTag: "session-react" }
  );
}
