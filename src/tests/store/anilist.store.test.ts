import { describe, expect, it } from "vitest";

import {
  createAnilistNotificationsSignalStore,
  createFriendsSignalStore,
  migrateFriendsData,
  migrateNotificationsData,
  type AnilistNotificationsSignalStore,
  type FriendsSignalStore,
} from "@/store/anilist.store";

function memoryStorage(backing = new Map<string, string>()): Storage {
  return {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => [...backing.keys()][index] ?? null,
    get length() {
      return backing.size;
    },
  } as Storage;
}

function setupNotifications(
  backing = new Map<string, string>()
): AnilistNotificationsSignalStore {
  return createAnilistNotificationsSignalStore({
    getStorage: () => memoryStorage(backing),
  });
}

function setupFriends(backing = new Map<string, string>()): FriendsSignalStore {
  return createFriendsSignalStore({ getStorage: () => memoryStorage(backing) });
}

describe("release feed", () => {
  it("prepends new releases unread", () => {
    const store = setupNotifications();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.addRelease({ mediaId: 2, title: "B", episode: 1, airedAt: 200 });
    const releases = store.atoms.releases.get();
    expect(releases.map((r) => r.mediaId)).toEqual([2, 1]);
    expect(releases.every((r) => r.read === false)).toBe(true);
    store.persistor.dispose();
  });

  it("dedupes by media and episode", () => {
    const store = setupNotifications();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 200 });
    store.addRelease({ mediaId: 1, title: "A", episode: 6, airedAt: 300 });
    expect(store.atoms.releases.get()).toHaveLength(2);
    store.persistor.dispose();
  });

  it("marks all releases read", () => {
    const store = setupNotifications();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.markReleasesRead();
    expect(store.atoms.releases.get().every((r) => r.read === true)).toBe(true);
    store.persistor.dispose();
  });

  it("tracks site notification reads without duplicates", () => {
    const store = setupNotifications();
    store.markSiteNotificationsRead([3, 1, 3]);
    store.markSiteNotificationsRead([1, 2]);
    expect(store.atoms.readNotificationIds.get()).toEqual([3, 1, 2]);
    store.persistor.dispose();
  });
});

describe("own list status", () => {
  const observation = {
    signature: "s",
    status: "CURRENT",
    mediaStatus: "RELEASING",
    title: "A",
    updatedAt: 1,
    nextEpisode: 5,
    nextAiringAt: 2,
  };

  it("merges an own status change into the existing observation", () => {
    const store = setupNotifications();
    store.saveObservation("7", { ...observation });
    store.markOwnListStatus(7, "COMPLETED");
    expect(store.atoms.observations.get()["7"]?.status).toBe("COMPLETED");
    expect(store.atoms.observations.get()["7"]?.mediaStatus).toBe("RELEASING");
    store.persistor.dispose();
  });

  it("ignores media ids without an observation", () => {
    const store = setupNotifications();
    store.markOwnListStatus(9, "COMPLETED");
    expect(store.atoms.observations.get()["9"]).toBeUndefined();
    store.persistor.dispose();
  });

  it("is a no-op for an unchanged status", () => {
    const store = setupNotifications();
    store.saveObservation("7", { ...observation });
    const before = store.atoms.observations.get();
    store.markOwnListStatus(7, "CURRENT");
    expect(store.atoms.observations.get()).toBe(before);
    store.persistor.dispose();
  });
});

describe("site watermark", () => {
  it("only moves forward", () => {
    const store = setupNotifications();
    store.setSiteMaxSeenId(10);
    store.setSiteMaxSeenId(4);
    expect(store.atoms.siteMaxSeenId.get()).toBe(10);
    store.persistor.dispose();
  });
});

describe("friends signal store", () => {
  it("adds and removes friends", () => {
    const store = setupFriends();
    store.addFriend({ id: 1, name: "Alice", avatar: null, added_at: 0 });
    store.addFriend({ id: 2, name: "Bob", avatar: null, added_at: 0 });
    expect(store.atoms.friends.get().map((f) => f.id)).toEqual([1, 2]);
    store.removeFriend(1);
    expect(store.atoms.friends.get().map((f) => f.id)).toEqual([2]);
    store.persistor.dispose();
  });

  it("caches profiles onto the matching friend", () => {
    const store = setupFriends();
    store.addFriend({ id: 1, name: "Alice", avatar: null, added_at: 0 });
    store.cacheProfile({
      id: 1,
      name: "Alice Updated",
      avatar: "avatar.png",
      anime_count: 0,
      episodes_watched: 0,
      mean_score: null,
      score_format: null,
      banner_image: null,
      about: null,
      is_following: null,
      is_follower: null,
    });
    expect(store.atoms.friends.get()[0].name).toBe("Alice Updated");
    store.persistor.dispose();
  });
});

describe("migrate helpers", () => {
  it("migrateFriendsData drops invalid rows", () => {
    expect(migrateFriendsData(null)).toEqual({ friends: [] });
    expect(
      migrateFriendsData({ friends: [{ id: 1, name: "  A  " }, { id: -2, name: "Bad" }] })
    ).toEqual({
      friends: [
        expect.objectContaining({ id: 1, name: "A" }),
      ],
    });
  });

  it("migrateNotificationsData handles legacy versions", () => {
    expect(migrateNotificationsData(null, 0).initialized).toBe(false);
    const migrated = migrateNotificationsData(
      { observations: { "1": { status: "CURRENT" } } },
      1
    );
    expect(migrated.observations["1"].status).toBe("CURRENT");
    expect(migrated.releases).toEqual([]);
  });
});
