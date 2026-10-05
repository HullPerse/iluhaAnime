import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  ChatMessage,
  MediaPlanItem,
  SessionIdentity,
  SessionUiStore,
} from "@/types/session";

/**
 * Local-only lobby UI state. Server/session data lives in TanStack Query
 * (`useSessionStatus`); this store keeps drafts alive across tab switches.
 *
 * Persisted: `identity` (lets the app offer a guest reconnect after a restart)
 * and the `displayName` draft (so the name input is not blank after a restart).
 * Host-local paths and the guest's `planPaths` mappings are never written to
 * localStorage (the host's paths never cross the wire, and a stale local path
 * would mislead a later room).
 */
export const useSessionStore = create<SessionUiStore>()(
  persist(
    (set) => ({
      chatDraft: "",
      chatReply: null,
      displayName: "",
      identity: null,
      joinInput: "",
      localItems: [],
      pendingChats: [],
      planPaths: {},
      playingItemId: null,
      addPendingChat: (message: ChatMessage) =>
        set((state) => ({ pendingChats: [...state.pendingChats, message] })),
      clearPlanPaths: () => set({ planPaths: {} }),
      removePendingChat: (id: string) =>
        set((state) => ({
          pendingChats: state.pendingChats.filter((m) => m.id !== id),
        })),
      reset: () =>
        set({
          chatDraft: "",
          chatReply: null,
          identity: null,
          joinInput: "",
          pendingChats: [],
          planPaths: {},
          playingItemId: null,
        }),
      setChatDraft: (chatDraft: string) => set({ chatDraft }),
      setChatReply: (chatReply: string | null) => set({ chatReply }),
      setDisplayName: (displayName: string) => set({ displayName }),
      setIdentity: (identity: SessionIdentity | null) => set({ identity }),
      setJoinInput: (joinInput: string) => set({ joinInput }),
      setLocalItems: (localItems: MediaPlanItem[]) => set({ localItems }),
      setPlanPath: (itemId: string, path: string) =>
        set((state) => ({ planPaths: { ...state.planPaths, [itemId]: path } })),
      setPlayingItemId: (playingItemId: string | null) =>
        set({ playingItemId }),
    }),
    {
      name: "sessionIdentity",
      version: 1,
      partialize: (state) => ({
        displayName: state.displayName,
        identity: state.identity,
      }),
    }
  )
);
