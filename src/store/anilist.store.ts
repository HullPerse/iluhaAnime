import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  AniListFriendsStore,
  AniListNotificationsStore,
  AniListObservation,
} from "@/types/anilist";

export const useAniListFriendsStore = create<AniListFriendsStore>()(
  persist(
    (set) => ({
      addFriend: (friend) =>
        set((state) => ({
          friends: state.friends.some((item) => item.id === friend.id)
            ? state.friends.map((item) =>
                item.id === friend.id ? { ...item, ...friend } : item
              )
            : [...state.friends, { ...friend, added_at: Date.now() }],
        })),
      cacheProfile: (profile) =>
        set((state) => ({
          friends: state.friends.map((friend) =>
            friend.id === profile.id
              ? {
                  ...friend,
                  name: profile.name,
                  avatar: profile.avatar,
                  profile,
                  profile_fetched_at: Date.now(),
                }
              : friend
          ),
        })),
      friends: [],
      removeFriend: (id) =>
        set((state) => ({
          friends: state.friends.filter((friend) => friend.id !== id),
        })),
    }),
    {
      migrate: (persistedState: unknown) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { friends: [] };
        }
        const state = persistedState as Partial<AniListFriendsStore>;
        return {
          friends: Array.isArray(state.friends)
            ? state.friends.flatMap((friend) => {
                if (
                  !friend ||
                  typeof friend !== "object" ||
                  typeof friend.id !== "number" ||
                  !Number.isInteger(friend.id) ||
                  friend.id <= 0 ||
                  typeof friend.name !== "string" ||
                  friend.name.trim().length === 0
                ) {
                  return [];
                }
                const profile =
                  friend.profile && friend.profile.id === friend.id
                    ? friend.profile
                    : undefined;
                return [
                  {
                    id: friend.id,
                    name: friend.name.trim(),
                    avatar:
                      typeof friend.avatar === "string" ? friend.avatar : null,
                    added_at:
                      typeof friend.added_at === "number" && friend.added_at > 0
                        ? friend.added_at
                        : 0,
                    ...(profile ? { profile } : {}),
                    ...(typeof friend.profile_fetched_at === "number"
                      ? { profile_fetched_at: friend.profile_fetched_at }
                      : {}),
                  },
                ];
              })
            : [],
        };
      },
      name: "anilistFriends",
      version: 1,
    }
  )
);

export const useAniListNotificationsStore = create<AniListNotificationsStore>()(
  persist(
    (set) => ({
      initialized: false,
      observations: {},
      saveObservation: (id, observation) =>
        set((state) => ({
          observations: { ...state.observations, [id]: observation },
        })),
      setInitialized: (initialized) => set({ initialized }),
    }),
    {
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== "object") return { initialized: false, observations: {} };
        const state = persistedState as Partial<AniListNotificationsStore> & {
          observations?: Record<string, Partial<AniListObservation> & { signature?: string }>;
        };
        // v1 -> v2: add nextEpisode/nextAiringAt for missed-episode detection while app was closed
        if (version < 2) {
          const migrated = { ...state.observations } as Record<string, AniListObservation>;
          for (const key of Object.keys(migrated)) {
            const obs = migrated[key] as Partial<AniListObservation>;
            migrated[key] = {
              signature: obs.signature ?? "",
              status: obs.status ?? "",
              title: obs.title ?? "",
              updatedAt: obs.updatedAt ?? 0,
              nextEpisode: obs.nextEpisode ?? null,
              nextAiringAt: obs.nextAiringAt ?? null,
            };
          }
          return { initialized: !!state.initialized, observations: migrated };
        }
        return state as AniListNotificationsStore;
      },
      name: "anilistReleaseObservations",
      version: 2,
    }
  )
);
