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

// Polled snapshot is source of truth; instant events only shorten wait.
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
