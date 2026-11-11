import type {
  AniListFriendsStore,
  AniListNotificationsStore,
  AniListObservation,
  AniListRelease,
  AniUserProfile,
} from "@/types/anilist/anilist";
import type { Persistor } from "@/types/core/persist";
import type { Cell } from "@/types/core/signal";

type FriendsActionKeys = "addFriend" | "cacheProfile" | "removeFriend";

export type FriendsData = Omit<AniListFriendsStore, FriendsActionKeys>;
type FriendsAtoms = { [K in keyof FriendsData]: Cell<FriendsData[K]> };

type NotificationsActionKeys =
  | "saveObservation"
  | "markOwnListStatus"
  | "addRelease"
  | "setReleaseCovers"
  | "markReleasesRead"
  | "markSiteNotificationsRead"
  | "setInitialized"
  | "setKnownListNames"
  | "setSiteMaxSeenId";

export type AnilistNotificationsData = Omit<AniListNotificationsStore, NotificationsActionKeys>;
type AnilistNotificationsAtoms = {
  [K in keyof AnilistNotificationsData]: Cell<AnilistNotificationsData[K]>;
};

export interface FriendsSignalStore {
  atoms: FriendsAtoms;
  persistor: Persistor;
  addFriend: (friend: AniListFriendsStore["friends"][number]) => void;
  cacheProfile: (profile: AniUserProfile) => void;
  removeFriend: (id: number) => void;
}

export interface AnilistNotificationsSignalStore {
  atoms: AnilistNotificationsAtoms;
  persistor: Persistor;
  saveObservation: (id: string, observation: AniListObservation) => void;
  markOwnListStatus: (mediaId: number, status: string) => void;
  addRelease: (release: Omit<AniListRelease, "read">) => void;
  setReleaseCovers: (covers: Record<number, string | null>) => void;
  markReleasesRead: () => void;
  markSiteNotificationsRead: (ids: number[]) => void;
  setInitialized: (initialized: boolean) => void;
  setKnownListNames: (knownListNames: string[]) => void;
  setSiteMaxSeenId: (id: number) => void;
}
