import { beforeEach, describe, expect, it } from "vitest";

import { useAniListNotificationsStore } from "@/store/anilist.store";

beforeEach(() => {
  useAniListNotificationsStore.setState({
    initialized: false,
    observations: {},
    releases: [],
    readNotificationIds: [],
    knownListNames: [],
    siteMaxSeenId: 0,
  });
});

describe("release feed", () => {
  it("prepends new releases unread", () => {
    const store = useAniListNotificationsStore.getState();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.addRelease({ mediaId: 2, title: "B", episode: 1, airedAt: 200 });
    const { releases } = useAniListNotificationsStore.getState();
    expect(releases.map((r) => r.mediaId)).toEqual([2, 1]);
    expect(releases.every((r) => r.read === false)).toBe(true);
  });

  it("dedupes by media and episode", () => {
    const store = useAniListNotificationsStore.getState();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 200 });
    store.addRelease({ mediaId: 1, title: "A", episode: 6, airedAt: 300 });
    expect(useAniListNotificationsStore.getState().releases).toHaveLength(2);
  });

  it("marks all releases read", () => {
    const store = useAniListNotificationsStore.getState();
    store.addRelease({ mediaId: 1, title: "A", episode: 5, airedAt: 100 });
    store.markReleasesRead();
    expect(useAniListNotificationsStore.getState().releases.every((r) => r.read === true)).toBe(
      true
    );
  });

  it("tracks site notification reads without duplicates", () => {
    const store = useAniListNotificationsStore.getState();
    store.markSiteNotificationsRead([3, 1, 3]);
    store.markSiteNotificationsRead([1, 2]);
    expect(useAniListNotificationsStore.getState().readNotificationIds).toEqual([3, 1, 2]);
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
    const store = useAniListNotificationsStore.getState();
    store.saveObservation("7", { ...observation });
    store.markOwnListStatus(7, "COMPLETED");
    expect(useAniListNotificationsStore.getState().observations["7"]?.status).toBe("COMPLETED");
    expect(useAniListNotificationsStore.getState().observations["7"]?.mediaStatus).toBe(
      "RELEASING"
    );
  });

  it("ignores media ids without an observation", () => {
    useAniListNotificationsStore.getState().markOwnListStatus(9, "COMPLETED");
    expect(useAniListNotificationsStore.getState().observations["9"]).toBeUndefined();
  });

  it("is a no-op for an unchanged status", () => {
    const store = useAniListNotificationsStore.getState();
    store.saveObservation("7", { ...observation });
    const before = useAniListNotificationsStore.getState().observations;
    store.markOwnListStatus(7, "CURRENT");
    expect(useAniListNotificationsStore.getState().observations).toBe(before);
  });
});

describe("site watermark", () => {
  it("only moves forward", () => {
    const store = useAniListNotificationsStore.getState();
    store.setSiteMaxSeenId(10);
    store.setSiteMaxSeenId(4);
    expect(useAniListNotificationsStore.getState().siteMaxSeenId).toBe(10);
  });
});
