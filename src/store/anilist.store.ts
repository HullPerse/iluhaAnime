import { createPersistedStoreContext } from "@/lib/state/persisted.utils";
import type { Persistor } from "@/lib/state/persist.utils";
import { createSignalStore, type Cell } from "@/lib/state/signal.store";
import { attemptSync } from "@/lib/utils/attempt.utils";
import type {
  AniListFriendsStore,
  AniListNotificationsStore,
  AniListObservation,
  AniListRelease,
  AniUserProfile,
} from "@/types/anilist";

export const ANILIST_FRIENDS_SCHEMA_VERSION = 1;
export const ANILIST_NOTIFICATIONS_SCHEMA_VERSION = 6;

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
    episode:
      typeof release.episode === "number" || typeof release.episode === "string"
        ? release.episode
        : "?",
    airedAt: typeof release.airedAt === "number" && release.airedAt > 0 ? release.airedAt : 0,
    read: release.read === true,
  };
}

const RELEASE_FEED_CAP = 100;

function normalizeObservation(obs: Partial<AniListObservation>): AniListObservation {
  return {
    signature: obs.signature ?? "",
    status: obs.status ?? "",
    mediaStatus: obs.mediaStatus ?? "",
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

export function migrateFriendsData(persistedState: unknown): {
  friends: AniListFriendsStore["friends"];
} {
  if (!persistedState || typeof persistedState !== "object") {
    return { friends: [] };
  }
  const state = persistedState as Partial<AniListFriendsStore>;
  return {
    friends: Array.isArray(state.friends) ? state.friends.flatMap(normalizeFriend) : [],
  };
}

export function migrateNotificationsData(
  persistedState: unknown,
  version: number
): {
  initialized: boolean;
  observations: Record<string, AniListObservation>;
  releases: AniListRelease[];
  readNotificationIds: number[];
  knownListNames: string[];
  siteMaxSeenId: number;
} {
  if (!persistedState || typeof persistedState !== "object")
    return {
      initialized: false,
      observations: {},
      releases: [],
      readNotificationIds: [],
      knownListNames: [],
      siteMaxSeenId: 0,
    };
  const state = persistedState as Partial<AniListNotificationsStore> & {
    observations?: Record<string, Partial<AniListObservation> & { signature?: string }>;
    releases?: Partial<AniListRelease>[];
    readNotificationIds?: unknown;
  };
  if (version < 2) {
    const base = migrateObservationsV2(state);
    return {
      initialized: base.initialized ?? false,
      observations: base.observations ?? {},
      releases: [],
      readNotificationIds: [],
      knownListNames: [],
      siteMaxSeenId: 0,
    };
  }
  const releases = Array.isArray(state.releases)
    ? state.releases.flatMap((item) => {
        const normalized = normalizeRelease(item);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    ...(state as AniListNotificationsStore),
    observations: Object.fromEntries(
      Object.entries(
        (state.observations ?? {}) as Record<string, Partial<AniListObservation>>
      ).map(([id, obs]) => [id, normalizeObservation(obs)])
    ),
    siteMaxSeenId:
      typeof state.siteMaxSeenId === "number" && state.siteMaxSeenId > 0
        ? state.siteMaxSeenId
        : 0,
    releases,
    readNotificationIds: Array.isArray(state.readNotificationIds)
      ? state.readNotificationIds.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id)
        )
      : [],
    knownListNames: Array.isArray(state.knownListNames) ? state.knownListNames : [],
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
  const [parsed, parseError] = attemptSync(() => JSON.parse(raw) as unknown);
  if (parseError !== null || !parsed || typeof parsed !== "object") return null;
  const envelope = parsed as { state?: unknown; version?: unknown };
  return {
    state: envelope.state && typeof envelope.state === "object" ? envelope.state : parsed,
    version: typeof envelope.version === "number" ? envelope.version : 0,
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

function buildMirrorAtoms<T extends object>(
  store: ReturnType<typeof createSignalStore>,
  data: T,
  mirror: Record<string, unknown>
): { [K in keyof T]: Cell<T[K]> } {
  const atoms = {} as { [K in keyof T]: Cell<T[K]> };
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const source = data as unknown as Record<string, unknown>;
  for (const key of Object.keys(data)) {
    const cell = store.atom(key, source[key]);
    const handle: Cell<unknown> = {
      id: cell.id,
      get: cell.get,
      set: (value) => {
        mirror[key] = value;
        cell.set(value);
      },
      update: (fn) => {
        const next = (fn as (prev: unknown) => unknown)(cell.get());
        mirror[key] = next;
        cell.set(next);
      },
      subscribe: cell.subscribe,
    };
    sink[key] = handle;
  }
  return atoms;
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
        data: migrateFriendsData(legacy.state) as Record<string, unknown>,
        schemaVersion: ANILIST_FRIENDS_SCHEMA_VERSION,
      };
    },
  });

  const persisted = persistor.read();
  const persistedFriends: unknown = persisted
    ? (persisted.data as { friends?: unknown }).friends
    : undefined;
  const friends = Array.isArray(persistedFriends)
    ? (persistedFriends as AniListFriendsStore["friends"])
    : [];
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
        data: migrateNotificationsData(
          legacy.state,
          legacy.version
        ) as unknown as Record<string, unknown>,
        schemaVersion: ANILIST_NOTIFICATIONS_SCHEMA_VERSION,
      };
    },
  });

  const persisted = persistor.read();
  const migrated =
    persisted && typeof persisted.schemaVersion === "number" && persisted.schemaVersion >= 2
      ? migrateNotificationsData(persisted.data, persisted.schemaVersion)
      : null;
  const data: AnilistNotificationsData = migrated ?? {
    ...DEFAULT_NOTIFICATIONS_DATA,
    ...((persisted?.data ?? {}) as Partial<AnilistNotificationsData>),
  };
  const mirror: Record<string, unknown> = { ...(data as unknown as Record<string, unknown>) };
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
        releases.some((item) => item.mediaId === release.mediaId && item.episode === release.episode)
      )
        return;
      atoms.releases.set(
        [{ ...release, read: false }, ...releases].slice(0, RELEASE_FEED_CAP)
      );
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
