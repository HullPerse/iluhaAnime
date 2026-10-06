import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  AniListFriendsStore,
  AniListNotificationsStore,
  AniListObservation,
  AniListRelease,
} from "@/types/anilist";

function isValidFriend(friend: unknown): friend is {
  id: number;
  name: string;
  avatar?: unknown;
  profile?: { id: number };
  added_at?: unknown;
  profile_fetched_at?: unknown;
} {
  if (!friend || typeof friend !== "object") return false;
  const f = friend as { id: unknown; name: unknown };
  return (
    typeof f.id === "number" &&
    Number.isInteger(f.id) &&
    f.id > 0 &&
    typeof f.name === "string" &&
    f.name.trim().length > 0
  );
}

function normalizeFriend(friend: unknown): AniListFriendsStore["friends"] {
  if (!isValidFriend(friend)) return [];
  const typed = friend as {
    id: number;
    name: string;
    avatar?: unknown;
    profile?: { id: number };
    added_at?: unknown;
    profile_fetched_at?: unknown;
  };
  const profile = typed.profile?.id === typed.id ? typed.profile : undefined;
  const base: AniListFriendsStore["friends"][number] = {
    id: typed.id,
    name: typed.name.trim(),
    avatar: typeof typed.avatar === "string" ? typed.avatar : null,
    added_at: typeof typed.added_at === "number" && typed.added_at > 0 ? typed.added_at : 0,
    ...(profile
      ? { profile: profile as unknown as AniListFriendsStore["friends"][number]["profile"] }
      : {}),
    ...(typeof typed.profile_fetched_at === "number"
      ? { profile_fetched_at: typed.profile_fetched_at }
      : {}),
  } as AniListFriendsStore["friends"][number];
  return [base];
}

function normalizeRelease(release: Partial<AniListRelease>): AniListRelease | null {
  if (typeof release.mediaId !== "number" || !(release.mediaId > 0)) return null;
  return {
    mediaId: release.mediaId,
    title: typeof release.title === "string" ? release.title : "",
    episode: typeof release.episode === "number" || typeof release.episode === "string" ? release.episode : "?",
    airedAt: typeof release.airedAt === "number" && release.airedAt > 0 ? release.airedAt : 0,
    read: release.read === true,
  };
}

const RELEASE_FEED_CAP = 100;

function normalizeObservation(obs: Partial<AniListObservation>): AniListObservation {
  return {
    signature: obs.signature ?? "",
    status: obs.status ?? "",
    title: obs.title ?? "",
    updatedAt: obs.updatedAt ?? 0,
    nextEpisode: obs.nextEpisode ?? null,
    nextAiringAt: obs.nextAiringAt ?? null,
  };
}

function migrateObservationsV2(
  state: Partial<AniListNotificationsStore> & {
    observations?: Record<string, Partial<AniListObservation>>;
  }
): Partial<AniListNotificationsStore> {
  const migrated = { ...state.observations } as Record<string, AniListObservation>;
  for (const key of Object.keys(migrated)) {
    migrated[key] = normalizeObservation(migrated[key] as Partial<AniListObservation>);
  }
  return { initialized: !!state.initialized, observations: migrated };
}

export const useAniListFriendsStore = create<AniListFriendsStore>()(
  persist(
    (set) => ({
      addFriend: (friend) =>
        set((state) => ({
          friends: state.friends.some((item) => item.id === friend.id)
            ? state.friends.map((item) => (item.id === friend.id ? { ...item, ...friend } : item))
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
          friends: Array.isArray(state.friends) ? state.friends.flatMap(normalizeFriend) : [],
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
      releases: [],
      readNotificationIds: [],
      knownListNames: [],
      saveObservation: (id, observation) =>
        set((state) => ({
          observations: { ...state.observations, [id]: observation },
        })),
      addRelease: (release) =>
        set((state) => {
          if (
            state.releases.some(
              (item) => item.mediaId === release.mediaId && item.episode === release.episode
            )
          )
            return state;
          return {
            releases: [
              { ...release, read: false },
              ...state.releases,
            ].slice(0, RELEASE_FEED_CAP),
          };
        }),
      markReleasesRead: () =>
        set((state) => ({
          releases: state.releases.map((item) => (item.read ? item : { ...item, read: true })),
        })),
      markSiteNotificationsRead: (ids) =>
        set((state) => {
          const known = new Set(state.readNotificationIds);
          let changed = false;
          for (const id of ids) {
            if (!known.has(id)) {
              known.add(id);
              changed = true;
            }
          }
          if (!changed) return state;
          return { readNotificationIds: [...known].slice(-500) };
        }),
      setInitialized: (initialized) => set({ initialized }),
      setKnownListNames: (knownListNames) => set({ knownListNames }),
    }),
    {
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== "object")
          return {
            initialized: false,
            observations: {},
            releases: [],
            readNotificationIds: [],
            knownListNames: [],
          };
        const state = persistedState as Partial<AniListNotificationsStore> & {
          observations?: Record<string, Partial<AniListObservation> & { signature?: string }>;
          releases?: Partial<AniListRelease>[];
          readNotificationIds?: unknown;
        };
        if (version < 2)
          return {
            ...migrateObservationsV2(state),
            releases: [],
            readNotificationIds: [],
            knownListNames: [],
          };
        const releases = Array.isArray(state.releases)
          ? state.releases.flatMap((item) => {
              const normalized = normalizeRelease(item);
              return normalized ? [normalized] : [];
            })
          : [];
        return {
          ...(state as AniListNotificationsStore),
          releases,
          readNotificationIds: Array.isArray(state.readNotificationIds)
            ? state.readNotificationIds.filter(
                (id): id is number => typeof id === "number" && Number.isInteger(id)
              )
            : [],
          knownListNames: Array.isArray(state.knownListNames) ? state.knownListNames : [],
        };
      },
      name: "anilistReleaseObservations",
      version: 5,
    }
  )
);
