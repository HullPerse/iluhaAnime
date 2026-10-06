import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  ChatMessage,
  MediaPlanItem,
  SessionIdentity,
  SessionUiStore,
} from "@/types/session";

// Host paths never stored; stale paths would mislead.
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
