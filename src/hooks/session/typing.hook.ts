import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sessionApi } from "@/api/session.api";
import {
  SESSION_TYPING_EVENT,
  TYPING_KEEPALIVE_MS,
  TYPING_TTL_MS,
} from "@/config/lobby/common.config";
import { useTauriEvent } from "@/hooks/tauriEvent.hook";
import { ignore } from "@/lib/utils/promise.utils";
import type { PeerInfo, SessionTyping } from "@/types/session";

// lobby.md §14.6; vanished peers fade after TTL.
export function useChatTyping(peers: PeerInfo[]): string[] {
  const [typingIds, setTypingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const expiryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const drop = useCallback((peerId: string) => {
    const timers = expiryTimers.current;
    const timer = timers.get(peerId);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(peerId);
    }
    setTypingIds((previous) => {
      if (!previous.has(peerId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(peerId);
      return next;
    });
  }, []);

  const raise = useCallback(
    (peerId: string) => {
      const timers = expiryTimers.current;
      const stale = timers.get(peerId);
      if (stale !== undefined) {
        clearTimeout(stale);
      }
      timers.set(
        peerId,
        setTimeout(() => drop(peerId), TYPING_TTL_MS)
      );
      setTypingIds((previous) =>
        previous.has(peerId) ? previous : new Set(previous).add(peerId)
      );
    },
    [drop]
  );

  useTauriEvent<SessionTyping>(
    SESSION_TYPING_EVENT,
    (event) => {
      if (event.payload.active) {
        raise(event.payload.peerId);
      } else {
        drop(event.payload.peerId);
      }
    },
    { errorTag: "session-typing" }
  );

  useEffect(() => {
    const timers = expiryTimers.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return useMemo(() => {
    if (typingIds.size === 0) {
      return [];
    }
    const byId = new Map(peers.map((peer) => [peer.peerId, peer]));
    const names: string[] = [];
    for (const peerId of typingIds) {
      const peer = byId.get(peerId);
      if (peer) {
        names.push(peer.displayName);
      }
    }
    return names;
  }, [peers, typingIds]);
}

// Leading-edge + keep-alive; server throttles.
export function useTypingSender(): {
  noteTyping: () => void;
  noteStopped: () => void;
} {
  const stateRef = useRef({ active: false, lastSentAt: 0 });

  const noteTyping = useCallback(() => {
    const now = Date.now();
    const state = stateRef.current;
    if (state.active && now - state.lastSentAt < TYPING_KEEPALIVE_MS) {
      return;
    }
    state.active = true;
    state.lastSentAt = now;
    ignore(sessionApi.typing(true));
  }, []);

  const noteStopped = useCallback(() => {
    const state = stateRef.current;
    if (!state.active) {
      return;
    }
    state.active = false;
    state.lastSentAt = Date.now();
    ignore(sessionApi.typing(false));
  }, []);

  return { noteTyping, noteStopped };
}
