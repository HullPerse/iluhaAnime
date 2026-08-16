import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  AniListFriendsStore,
  AniListNotificationsStore,
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
    { name: "anilistReleaseObservations", version: 1 }
  )
);
