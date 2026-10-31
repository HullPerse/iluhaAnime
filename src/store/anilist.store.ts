import { buildMirrorAtoms, createPersistedStoreContext } from "@/lib/core/persisted.utils";
import { isRecord } from "@/lib/core/record.utils";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";
import { attemptSync } from "@/lib/core/attempt.utils";
import type {
  AniListFriendsStore,
  AniListNotificationsStore,
  AniListObservation,
  AniListRelease,
  AniUserProfile,
} from "@/types/anilist/anilist";

export const ANILIST_FRIENDS_SCHEMA_VERSION = 1;
export const ANILIST_NOTIFICATIONS_SCHEMA_VERSION = 6;

function isValidFriend(
  friend: unknown
): friend is Record<string, unknown> & { id: number; name: string } {
  if (!isRecord(friend)) return false;
  return (
    typeof friend.id === "number" &&
    Number.isInteger(friend.id) &&
    friend.id > 0 &&
    typeof friend.name === "string" &&
    friend.name.trim().length > 0
  );
}

function normalizeFriend(friend: unknown): AniListFriendsStore["friends"] {
  if (!isValidFriend(friend)) return [];
  const profile =
    isRecord(friend.profile) && friend.profile.id === friend.id ? friend.profile : undefined;
  const base: AniListFriendsStore["friends"][number] = {
    id: friend.id,
    name: friend.name.trim(),
    avatar: typeof friend.avatar === "string" ? friend.avatar : null,
    added_at: typeof friend.added_at === "number" && friend.added_at > 0 ? friend.added_at : 0,
    ...(profile
      ? { profile: profile as unknown as AniListFriendsStore["friends"][number]["profile"] }
      : {}),
    ...(typeof friend.profile_fetched_at === "number"
      ? { profile_fetched_at: friend.profile_fetched_at }
      : {}),
  };
  return [base];
}

function normalizeRelease(release: unknown): AniListRelease | null {
  if (!isRecord(release)) return null;
  const mediaId = release.mediaId;
  if (typeof mediaId !== "number" || !(mediaId > 0)) return null;
  return {
    mediaId,
    title: typeof release.title === "string" ? release.title : "",
    episode:
      typeof release.episode === "number" || typeof release.episode === "string"
        ? release.episode
        : "?",
    airedAt: typeof release.airedAt === "number" && release.airedAt > 0 ? release.airedAt : 0,
    read: release.read === true,
  };
}

const RELEASE_FEED_CAP = 100;

function normalizeObservation(obs: unknown): AniListObservation {
  if (!isRecord(obs)) {
    return {
      signature: "",
      status: "",
      mediaStatus: "",
      title: "",
      updatedAt: 0,
      nextEpisode: null,
      nextAiringAt: null,
    };
  }
  return {
    signature: typeof obs.signature === "string" ? obs.signature : "",
    status: typeof obs.status === "string" ? obs.status : "",
    mediaStatus: typeof obs.mediaStatus === "string" ? obs.mediaStatus : "",
    title: typeof obs.title === "string" ? obs.title : "",
    updatedAt: typeof obs.updatedAt === "number" ? obs.updatedAt : 0,
    nextEpisode: typeof obs.nextEpisode === "number" ? obs.nextEpisode : null,
    nextAiringAt: typeof obs.nextAiringAt === "number" ? obs.nextAiringAt : null,
  };
}

function migrateObservationsV2(
  state: Record<string, unknown>
): Partial<AniListNotificationsStore> {
  const rawObservations = isRecord(state.observations) ? state.observations : {};
  const migrated: Record<string, AniListObservation> = {};
  for (const [key, obs] of Object.entries(rawObservations)) {
    migrated[key] = normalizeObservation(obs);
  }
  return { initialized: state.initialized === true, observations: migrated };
}

export function migrateFriendsData(persistedState: unknown): {
  friends: AniListFriendsStore["friends"];
} {
  if (!isRecord(persistedState)) return { friends: [] };
  return {
    friends: Array.isArray(persistedState.friends)
      ? persistedState.friends.flatMap(normalizeFriend)
      : [],
  };
}

export function migrateNotificationsData(
  persistedState: unknown,
  version: number
): AnilistNotificationsData {
  if (!isRecord(persistedState)) {
    return {
      initialized: false,
      observations: {},
      releases: [],
      readNotificationIds: [],
      knownListNames: [],
      siteMaxSeenId: 0,
    };
  }
  if (version < 2) {
    const base = migrateObservationsV2(persistedState);
    return {
      initialized: base.initialized ?? false,
      observations: base.observations ?? {},
      releases: [],
      readNotificationIds: [],
      knownListNames: [],
      siteMaxSeenId: 0,
    };
  }
  const rawObservations = isRecord(persistedState.observations)
    ? persistedState.observations
    : {};
  const observations: Record<string, AniListObservation> = {};
  for (const [id, obs] of Object.entries(rawObservations)) {
    observations[id] = normalizeObservation(obs);
  }
  const releases = Array.isArray(persistedState.releases)
    ? persistedState.releases.flatMap((item) => {
        const normalized = normalizeRelease(item);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    initialized: persistedState.initialized === true,
    observations,
    releases,
    readNotificationIds: Array.isArray(persistedState.readNotificationIds)
      ? persistedState.readNotificationIds.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id)
        )
      : [],
    knownListNames: Array.isArray(persistedState.knownListNames)
      ? persistedState.knownListNames.filter(
          (name): name is string => typeof name === "string"
        )
      : [],
    siteMaxSeenId:
      typeof persistedState.siteMaxSeenId === "number" && persistedState.siteMaxSeenId > 0
        ? persistedState.siteMaxSeenId
        : 0,
  };
}

function readLegacyEnvelope(
  getStorage: () => Storage | undefined,
  legacyKey: string
): { state: unknown; version: number } | null {
  const [storage, storageError] = attemptSync(() => getStorage());
  if (storageError !== null || !storage) return null;
  const [raw, readError] = attemptSync(() => storage.getItem(legacyKey));
  if (readError !== null || !raw) return null;
  const [parsed, parseError] = attemptSync((): unknown => JSON.parse(raw));
  if (parseError !== null || !isRecord(parsed)) return null;
  return {
    state: isRecord(parsed.state) ? parsed.state : parsed,
    version: typeof parsed.version === "number" ? parsed.version : 0,
  };
}

type FriendsActionKeys = "addFriend" | "cacheProfile" | "removeFriend";

export type FriendsData = Omit<AniListFriendsStore, FriendsActionKeys>;
export type FriendsAtoms = { [K in keyof FriendsData]: Cell<FriendsData[K]> };

type NotificationsActionKeys =
  | "saveObservation"
  | "markOwnListStatus"
  | "addRelease"
  | "markReleasesRead"
  | "markSiteNotificationsRead"
  | "setInitialized"
  | "setKnownListNames"
  | "setSiteMaxSeenId";

export type AnilistNotificationsData = Omit<AniListNotificationsStore, NotificationsActionKeys>;
export type AnilistNotificationsAtoms = {
  [K in keyof AnilistNotificationsData]: Cell<AnilistNotificationsData[K]>;
};

export interface AnilistSignalOptions {
  getStorage?: () => Storage | undefined;
  debounceMs?: number;
}

export interface FriendsSignalStore {
  atoms: FriendsAtoms;
  persistor: Persistor;
  addFriend: (friend: AniListFriendsStore["friends"][number]) => void;
  cacheProfile: (profile: AniUserProfile) => void;
  removeFriend: (id: number) => void;
}

export function createFriendsSignalStore(options: AnilistSignalOptions = {}): FriendsSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "anilistFriends",
    short: "anilist",
    schemaVersion: ANILIST_FRIENDS_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => {
      const legacy = readLegacyEnvelope(get, "anilistFriends");
      if (!legacy) return null;
      return {
        data: { ...migrateFriendsData(legacy.state) },
        schemaVersion: ANILIST_FRIENDS_SCHEMA_VERSION,
      };
    },
  });

  const persisted = persistor.read();
  const persistedFriends = persisted?.data.friends;
  const friends = Array.isArray(persistedFriends) ? persistedFriends.flatMap(normalizeFriend) : [];
  const data: FriendsData = { friends };
  const mirror: Record<string, unknown> = { friends };
  const atoms = buildMirrorAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const handle: FriendsSignalStore = {
    atoms,
    persistor,
    addFriend: (friend) => {
      const current = atoms.friends.get();
      atoms.friends.set(
        current.some((item) => item.id === friend.id)
          ? current.map((item) => (item.id === friend.id ? { ...item, ...friend } : item))
          : [...current, { ...friend, added_at: Date.now() }]
      );
    },
    cacheProfile: (profile) => {
      const current = atoms.friends.get();
      atoms.friends.set(
        current.map((friend) =>
          friend.id === profile.id
            ? {
                ...friend,
                name: profile.name,
                avatar: profile.avatar,
                profile,
                profile_fetched_at: Date.now(),
              }
            : friend
        )
      );
    },
    removeFriend: (id) => {
      atoms.friends.set(atoms.friends.get().filter((friend) => friend.id !== id));
    },
  };

  finishAdopt(() => ({ ...mirror }), { remove: "anilistFriends" });

  return handle;
}

const DEFAULT_NOTIFICATIONS_DATA: AnilistNotificationsData = {
  initialized: false,
  observations: {},
  releases: [],
  readNotificationIds: [],
  knownListNames: [],
  siteMaxSeenId: 0,
};

export interface AnilistNotificationsSignalStore {
  atoms: AnilistNotificationsAtoms;
  persistor: Persistor;
  saveObservation: (id: string, observation: AniListObservation) => void;
  markOwnListStatus: (mediaId: number, status: string) => void;
  addRelease: (release: Omit<AniListRelease, "read">) => void;
  markReleasesRead: () => void;
  markSiteNotificationsRead: (ids: number[]) => void;
  setInitialized: (initialized: boolean) => void;
  setKnownListNames: (knownListNames: string[]) => void;
  setSiteMaxSeenId: (id: number) => void;
}

export function createAnilistNotificationsSignalStore(
  options: AnilistSignalOptions = {}
): AnilistNotificationsSignalStore {
  const { store, persistor, finishAdopt } = createPersistedStoreContext({
    storeName: "anilistReleaseObservations",
    short: "anilist",
    schemaVersion: ANILIST_NOTIFICATIONS_SCHEMA_VERSION,
    getStorage: options.getStorage,
    debounceMs: options.debounceMs,
    onFallback: (get) => {
      const legacy = readLegacyEnvelope(get, "anilistReleaseObservations");
      if (!legacy) return null;
      return {
        data: { ...migrateNotificationsData(legacy.state, legacy.version) },
        schemaVersion: ANILIST_NOTIFICATIONS_SCHEMA_VERSION,
      };
    },
  });

  const persisted = persistor.read();
  const data: AnilistNotificationsData = persisted
    ? migrateNotificationsData(persisted.data, persisted.schemaVersion)
    : { ...DEFAULT_NOTIFICATIONS_DATA };
  const mirror: Record<string, unknown> = { ...data };
  const atoms = buildMirrorAtoms(store, data, mirror);

  store.subscribeAll(() => {
    persistor.write(mirror);
  });

  const handle: AnilistNotificationsSignalStore = {
    atoms,
    persistor,
    saveObservation: (id, observation) => {
      atoms.observations.set({ ...atoms.observations.get(), [id]: observation });
    },
    markOwnListStatus: (mediaId, status) => {
      const key = String(mediaId);
      const observations = atoms.observations.get();
      const prev = observations[key];
      if (!prev || prev.status === status) return;
      atoms.observations.set({ ...observations, [key]: { ...prev, status } });
    },
    addRelease: (release) => {
      const releases = atoms.releases.get();
      if (
        releases.some(
          (item) => item.mediaId === release.mediaId && item.episode === release.episode
        )
      )
        return;
      atoms.releases.set([{ ...release, read: false }, ...releases].slice(0, RELEASE_FEED_CAP));
    },
    markReleasesRead: () => {
      atoms.releases.set(
        atoms.releases.get().map((item) => (item.read ? item : { ...item, read: true }))
      );
    },
    markSiteNotificationsRead: (ids) => {
      const readNotificationIds = atoms.readNotificationIds.get();
      const known = new Set(readNotificationIds);
      let changed = false;
      for (const id of ids) {
        if (!known.has(id)) {
          known.add(id);
          changed = true;
        }
      }
      if (!changed) return;
      atoms.readNotificationIds.set([...known].slice(-500));
    },
    setInitialized: (initialized) => atoms.initialized.set(initialized),
    setKnownListNames: (knownListNames) => atoms.knownListNames.set(knownListNames),
    setSiteMaxSeenId: (id) => {
      if (id > atoms.siteMaxSeenId.get()) atoms.siteMaxSeenId.set(id);
    },
  };

  finishAdopt(() => ({ ...mirror }), { remove: "anilistReleaseObservations" });

  return handle;
}

const friends = createFriendsSignalStore();
const anilistNotifications = createAnilistNotificationsSignalStore();

export const anilistFriendsAtoms = friends.atoms;
export const anilistFriendsPersistor = friends.persistor;
export const addAnilistFriend = friends.addFriend;
export const cacheAnilistProfile = friends.cacheProfile;
export const removeAnilistFriend = friends.removeFriend;

export const anilistNotificationsAtoms = anilistNotifications.atoms;
export const anilistNotificationsPersistor = anilistNotifications.persistor;
export const saveAnilistObservation = anilistNotifications.saveObservation;
export const markOwnAnilistListStatus = anilistNotifications.markOwnListStatus;
export const addAnilistRelease = anilistNotifications.addRelease;
export const markAnilistReleasesRead = anilistNotifications.markReleasesRead;
export const markSiteNotificationsRead = anilistNotifications.markSiteNotificationsRead;
export const setAnilistInitialized = anilistNotifications.setInitialized;
export const setKnownAnilistListNames = anilistNotifications.setKnownListNames;
export const setSiteMaxSeenId = anilistNotifications.setSiteMaxSeenId;

function flushPersistors(): void {
  friends.persistor.flush();
  anilistNotifications.persistor.flush();
}

if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof document !== "undefined"
) {
  window.addEventListener("beforeunload", flushPersistors);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPersistors();
  });
}
